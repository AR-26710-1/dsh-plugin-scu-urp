"""
四川大学教务系统与微服务插件 - 路径与运行时环境工具模块
支持源码开发模式与 PyInstaller 冻结打包独立二进制模式
确保用户数据、配置与加密凭据在任何运行模式下均持久化保存在正确目录中
"""
import os
import sys
from pathlib import Path


def is_frozen() -> bool:
    """是否处于 PyInstaller / cx_Freeze 等冻结独立二进制模式"""
    return getattr(sys, "frozen", False)


def get_base_dir() -> Path:
    """
    获取服务运行的基础根目录 (优先指向 server/ 目录)
    - 源码运行: 返回 server/ 真实代码目录
    - 打包二进制运行: 若 exe 位于 bin/ 目录下，则返回 bin 同级的 server/ 目录
    """
    if is_frozen():
        exe_path = Path(sys.executable).resolve()
        # 若位于 bin/ 目录下
        if exe_path.parent.name.lower() == "bin":
            server_dir = exe_path.parent.parent / "server"
            server_dir.mkdir(parents=True, exist_ok=True)
            return server_dir
        # 若直接位于根目录或其他目录
        return exe_path.parent
    return Path(__file__).resolve().parent


def get_data_dir() -> str:
    """获取持久化数据目录 (server/data)"""
    data_dir = get_base_dir() / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    return str(data_dir)


def get_credentials_path() -> Path:
    """获取加密凭据存储文件绝对路径 (server/.credentials.json)"""
    return get_base_dir() / ".credentials.json"
