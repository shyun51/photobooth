#!/usr/bin/env python3
"""인생네컷 프레임 PNG 검사: python tools/check_frame.py IMAGE.png [IMAGE2.png ...]"""
import sys
from pathlib import Path
from PIL import Image

W, H = 1200, 3600
SLOTS = [(100, 120, 1000, 750), (100, 910, 1000, 750),
         (100, 1700, 1000, 750), (100, 2490, 1000, 750)]


def alpha_ratio(im, box, opaque=False):
    alpha = im.getchannel("A").crop(box)
    values = alpha.getdata()
    total = alpha.width * alpha.height
    count = sum(a >= 128 if opaque else a < 128 for a in values)
    return count / total if total else 0.0


def check(path):
    errors, warnings, rows = [], [], []
    try:
        with Image.open(path) as source:
            size = source.size
            has_alpha = "A" in source.getbands() or "transparency" in source.info
            if size != (W, H):
                errors.append(f"크기 오류: {size}, 요구 {(W, H)}")
            if not has_alpha:
                errors.append("알파 채널 없음")
            if size != (W, H) or not has_alpha:
                return errors, warnings, rows
            image = source.convert("RGBA")
            for i, (x, y, w, h) in enumerate(SLOTS, 1):
                transparent = alpha_ratio(image, (x, y, x+w, y+h))
                opaque = alpha_ratio(image, (x+40, y+40, x+w-40, y+h-40), True)
                guide = opaque >= .03
                rows.append((i, transparent, opaque, guide))
                if transparent < .4:
                    errors.append(f"{i}컷 사진이 가려짐: 투명 비율 {transparent:.1%} (<40%)")
            date_opaque = alpha_ratio(image, (300, 3360, 900, 3480), True)
            if date_opaque > .05:
                warnings.append(f"날짜 영역 불투명 비율 {date_opaque:.1%} (날짜와 겹칠 수 있음)")
    except Exception as exc:
        errors.append(f"이미지 읽기 오류: {exc}")
    return errors, warnings, rows


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    has_errors = False
    for item in sys.argv[1:]:
        path = Path(item)
        errors, warnings, rows = check(path)
        has_errors |= bool(errors)
        print(f"\n## {path.name} — {'오류' if errors else '통과'}")
        print("컷 | 슬롯 투명 비율 | inset 불투명 비율 | 인물 있음")
        print("---|---:|---:|---")
        for i, transparent, opaque, guide in rows:
            print(f"{i} | {transparent:.1%} | {opaque:.1%} | {'예' if guide else '아니요'}")
        for err in errors:
            print("오류:", err)
        for warning in warnings:
            print("경고:", warning)
    return 1 if has_errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
