from __future__ import annotations

import argparse
from pathlib import Path

from . import backup, db
from .settings import ASSET_DIR, BACKUP_DIR, UPLOAD_DIR


def main() -> None:
    parser = argparse.ArgumentParser(description="Web Resume 数据维护")
    subparsers = parser.add_subparsers(dest="command", required=True)

    backup_parser = subparsers.add_parser("backup", help="创建完整备份")
    backup_parser.add_argument("destination", nargs="?", type=Path)

    restore = subparsers.add_parser("restore", help="从 SQLite 备份恢复")
    restore.add_argument("source", type=Path)

    args = parser.parse_args()
    if args.command == "backup":
        path = backup.create_full_backup(
            backup_dir=BACKUP_DIR,
            asset_dir=ASSET_DIR,
            upload_dir=UPLOAD_DIR,
            destination=args.destination,
        )
        print(f"备份已创建：{path}")
        return

    if args.source.suffix.lower() == ".zip":
        result = backup.restore_full_backup(
            args.source,
            backup_dir=BACKUP_DIR,
            asset_dir=ASSET_DIR,
            upload_dir=UPLOAD_DIR,
        )
        print(
            f"恢复完成；恢复了 {result.restored_files} 个附件；"
            f"隔离了 {result.quarantined_files} 个快照外附件；"
            f"恢复前数据已备份至：{result.safety_backup}"
        )
        return

    safety_backup = db.restore_database(args.source)
    print(f"数据库恢复完成；恢复前数据库已备份至：{safety_backup}")


if __name__ == "__main__":
    main()
