#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
_build-audio.py —— 把 音乐/ 里的 WAV / FLAC 母带转成上线用的双格式音频

母带不进仓库：7 首 BGM 是 48kHz 立体声 WAV 共约 80MB，17 条 SFX 是 FLAC。
仓库里只放这里生成的 opus + m4a，落在 assets/audio/。和 _build-fonts.py
一样的约定：源在外、产物进仓库、可重跑。

  python assets/dev/_build-audio.py [源素材根目录]

默认源目录是仓库上一级的 音乐/。

── 为什么要预处理，而不是直接编码 ─────────────────────────
两件事在母带里是坏的，必须在这一步修掉，运行时补不回来：

  1. 循环缝。BGM2 尾部有 2.08 秒静音、BGM4 有 0.86 秒。循环播放时那段静音
     就是一个空拍，听感上像是「音乐断了一下又续上」。所以 BGM 只裁尾部，
     不裁开头——开头的起拍是编曲的一部分。

  2. 触发延迟与电平落差。SFX03 和 SFX17 有 0.05~0.10 秒的前置静音，
     点下去到出声之间那一下空档是能听出来的；SFX01 实际发声只有 0.45 秒，
     文件却有 2.00 秒，剩下的全是尾巴。更要命的是电平：SFX12 峰值 −0.6dB，
     SFX08 平均只有 −38.4dB，跨度 23dB——按原样播，泡泡点击会盖过音乐，
     收藏飞入根本听不见。

  这里对 SFX 做的是**峰值归一化到 −3dBFS**，不是响度归一化：短音效上
     EBU R128 的测量窗口不够长，loudnorm 出来的结果不稳定，而峰值归一是
     确定性的、不引入任何处理痕迹。归一之后所有音效站在同一条线上，
     真正的「谁大谁小」交给 js/config.js 的 AUDIO_SFX_GAIN_TRIM 按听感调——
     那是混音决定，属于可调参数，不该烧进音频文件里。

  裁静音只裁首尾，不碰中间：SFX08 收藏飞入内部本来就有间隔，
     用 silenceremove 的默认参数会把中间也压掉，那条音效就散了。

── 为什么是双格式 ─────────────────────────────────────
opus 更小（全套 5.4MB vs aac 7.3MB），但 Safari 要 17.5 才支持。
m4a/aac 全平台都能放。两套都发，运行时用 canPlayType 选一种，
总共约 12.7MB。这是个要发给别人打开的展示站，不能赌浏览器版本。
"""

import os
import re
import sys
import json
import shutil
import subprocess

DEV = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(DEV, '..', '..'))
SRC_ROOT = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else \
    os.path.join(os.path.dirname(REPO), '音乐')

OUT_ROOT = os.path.join(REPO, 'assets', 'audio')

# 静音判定阈值。−45dB 是试出来的：−60 太宽松，尾巴上的噪声地板会被当成有声；
# −35 又会啃掉 SFX03 那种淡入的头。
SILENCE_DB = '-45dB'
# 首尾各留一点静音，直接切到波形上会「咔」一声。
KEEP_HEAD_SEC = 0.015
KEEP_TAIL_SEC = 0.030
# SFX 峰值归一化目标。留 3dB 余量给运行时的增益叠加，避免削顶。
SFX_PEAK_DBFS = -3.0

BGM_BITRATE = {'opus': '96k', 'm4a': '128k'}
SFX_BITRATE = {'opus': '64k', 'm4a': '96k'}


def run(args):
    """跑一条 ffmpeg/ffprobe，返回 (stdout, stderr)。失败直接抛，不静默继续。"""
    proc = subprocess.run(args, capture_output=True)
    out = proc.stdout.decode('utf-8', 'replace')
    err = proc.stderr.decode('utf-8', 'replace')
    if proc.returncode != 0:
        raise RuntimeError('命令失败：' + ' '.join(args[:2]) + '\n' + err[-2000:])
    return out, err


def probe_duration(path):
    out, _ = run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
                  '-of', 'csv=p=0', path])
    return float(out.strip())


def probe_peak(path, filters=''):
    """量峰值。filters 非空时先过一遍滤镜再量，用来预测处理后的电平。"""
    args = ['ffmpeg', '-hide_banner', '-nostats', '-i', path, '-af']
    args.append((filters + ',' if filters else '') + 'volumedetect')
    args += ['-f', 'null', '-']
    _, err = run(args)
    hit = re.search(r'max_volume:\s*(-?[\d.]+) dB', err)
    return float(hit.group(1)) if hit else 0.0


def trim_filter(head, tail):
    """
    首尾裁静音。只有这一种写法能保证不动中间：
    正向 silenceremove 只处理开头（start_periods=1），
    然后 areverse 把音频翻过来，再来一次「只处理开头」，等于处理原来的结尾。
    stop_periods=-1 那种写法会连中间的间隔一起吃掉，SFX08 会被拆散。
    """
    parts = []
    if head:
        parts.append('silenceremove=start_periods=1:start_silence=%.3f:'
                     'start_threshold=%s:detection=peak' % (KEEP_HEAD_SEC, SILENCE_DB))
    if tail:
        parts.append('areverse')
        parts.append('silenceremove=start_periods=1:start_silence=%.3f:'
                     'start_threshold=%s:detection=peak' % (KEEP_TAIL_SEC, SILENCE_DB))
        parts.append('areverse')
    return ','.join(parts)


def encode(src, dst, filters, kind, fmt):
    rate = (BGM_BITRATE if kind == 'bgm' else SFX_BITRATE)[fmt]
    args = ['ffmpeg', '-y', '-hide_banner', '-nostats', '-loglevel', 'error', '-i', src]
    if filters:
        args += ['-af', filters]
    if fmt == 'opus':
        # libopus 内部固定 48kHz，44.1k 的 SFX 会被自动重采样，不用手动指定。
        args += ['-c:a', 'libopus', '-b:a', rate, '-vbr', 'on',
                 '-application', 'audio']
    else:
        args += ['-c:a', 'aac', '-b:a', rate, '-movflags', '+faststart']
    args.append(dst)
    run(args)
    return os.path.getsize(dst)


def build_one(src, key, kind, report):
    """处理一条素材，输出 opus + m4a 两份。"""
    out_dir = os.path.join(OUT_ROOT, kind)
    os.makedirs(out_dir, exist_ok=True)

    raw_dur = probe_duration(src)
    raw_peak = probe_peak(src)

    if kind == 'bgm':
        # BGM 只裁尾：开头的起拍是编曲的一部分，裁了就变成硬起。
        # 电平也不动——7 首母带的平均值在 −16.5 ~ −18.5dB 之间，本来就齐。
        filters = trim_filter(head=False, tail=True)
        gain_db = 0.0
    else:
        filters = trim_filter(head=True, tail=True)
        # 归一量按「裁完之后的峰值」算，不能用原始峰值：
        # 裁掉的如果正好是最响的那一段（不会发生，但逻辑上要对齐），差一大截。
        trimmed_peak = probe_peak(src, filters)
        gain_db = SFX_PEAK_DBFS - trimmed_peak
        filters = filters + ',volume=%.2fdB' % gain_db

    sizes = {}
    for fmt in ('opus', 'm4a'):
        dst = os.path.join(out_dir, key + '.' + fmt)
        sizes[fmt] = encode(src, dst, filters, kind, fmt)

    new_dur = probe_duration(os.path.join(out_dir, key + '.m4a'))
    report.append({
        'key': key, 'kind': kind,
        'src_dur': round(raw_dur, 3), 'out_dur': round(new_dur, 3),
        'trimmed': round(raw_dur - new_dur, 3),
        'src_peak': raw_peak, 'gain_db': round(gain_db, 2),
        'opus': sizes['opus'], 'm4a': sizes['m4a']
    })


def collect():
    """扫源目录。BGM 按 BGM<n>.wav，SFX 按 SFX<nn> 开头的 flac（文件名带中文说明）。"""
    if not os.path.isdir(SRC_ROOT):
        raise SystemExit('找不到源目录：' + SRC_ROOT)
    jobs = []
    for name in sorted(os.listdir(SRC_ROOT)):
        path = os.path.join(SRC_ROOT, name)
        if not os.path.isfile(path):
            continue
        bgm = re.match(r'^BGM(\d+)\.wav$', name, re.I)
        if bgm:
            jobs.append((path, 'bgm' + bgm.group(1), 'bgm'))
            continue
        sfx = re.match(r'^SFX(\d+)', name, re.I)
        if sfx and name.lower().endswith(('.flac', '.wav')):
            jobs.append((path, 'sfx' + sfx.group(1).zfill(2), 'sfx'))
    return jobs


def main():
    if not shutil.which('ffmpeg') or not shutil.which('ffprobe'):
        raise SystemExit('需要 ffmpeg / ffprobe 在 PATH 上。')

    jobs = collect()
    if not jobs:
        raise SystemExit('源目录里没找到 BGM*.wav 或 SFX*.flac：' + SRC_ROOT)

    report = []
    for src, key, kind in jobs:
        build_one(src, key, kind, report)
        print(key, 'ok', flush=True)

    lines = []
    total = {'opus': 0, 'm4a': 0}
    lines.append('%-8s %8s %8s %8s %9s %9s %9s' %
                 ('key', '原时长', '成品', '裁掉', '增益dB', 'opus', 'm4a'))
    for r in report:
        total['opus'] += r['opus']
        total['m4a'] += r['m4a']
        lines.append('%-8s %8.2f %8.2f %8.2f %9.2f %8.1fK %8.1fK' % (
            r['key'], r['src_dur'], r['out_dur'], r['trimmed'], r['gain_db'],
            r['opus'] / 1024.0, r['m4a'] / 1024.0))
    lines.append('')
    lines.append('opus 合计 %.2f MB ｜ m4a 合计 %.2f MB ｜ 双格式 %.2f MB' % (
        total['opus'] / 1048576.0, total['m4a'] / 1048576.0,
        (total['opus'] + total['m4a']) / 1048576.0))

    text = '\n'.join(lines)
    # 直接 print 中文在部分终端会乱码，落一份 UTF-8 文件，两边都能看。
    with open(os.path.join(DEV, '_audio-report.txt'), 'w', encoding='utf-8') as fh:
        fh.write(text + '\n')
    with open(os.path.join(DEV, '_audio-report.json'), 'w', encoding='utf-8') as fh:
        json.dump(report, fh, ensure_ascii=False, indent=2)
    print(text)


if __name__ == '__main__':
    main()
