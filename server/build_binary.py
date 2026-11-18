"""
四川大学教务系统 (URP) 后端服务 - 独立免安装可执行程序打包脚本
使用 PyInstaller 将 FastAPI + uvicorn + ddddocr + requests 打包为单文件独立程序
输出目录: bin/scu-urp-service.exe
"""
import os
import sys
import shutil
import subprocess
from pathlib import Path


def main():
    print("[Build] 开始准备构建四川大学本地服务独立可执行程序...")

    # 1. 定位 Python 3.12 解释器
    python_exe = sys.executable
    if "msys" in python_exe.lower() or "mingw" in python_exe.lower():
        cand = r"C:\Users\30315\AppData\Local\Programs\Python\Python312\python.exe"
        if os.path.exists(cand):
            python_exe = cand

    print(f"[Build] 使用 Python 解释器: {python_exe}")

    # 2. 定位 ddddocr 所在目录与 onnx 资源
    server_dir = Path(__file__).resolve().parent
    repo_root = server_dir.parent
    bin_dir = repo_root / "bin"
    build_dir = repo_root / "build"

    bin_dir.mkdir(parents=True, exist_ok=True)
    build_dir.mkdir(parents=True, exist_ok=True)

    # 获取 ddddocr 路径
    res = subprocess.run(
        [python_exe, "-c", "import ddddocr, os; print(os.path.dirname(ddddocr.__file__))"],
        capture_output=True,
        text=True,
    )
    if res.returncode != 0:
        print(f"[Build Error] 无法加载 ddddocr: {res.stderr}")
        return 1

    ddddocr_dir = Path(res.stdout.strip())
    print(f"[Build] 定位到 ddddocr 安装路径: {ddddocr_dir}")

    # 3. 构造 PyInstaller 命令行参数
    hidden_imports = [
        "uvicorn",
        "uvicorn.logging",
        "uvicorn.loops",
        "uvicorn.loops.auto",
        "uvicorn.protocols",
        "uvicorn.protocols.http",
        "uvicorn.protocols.http.auto",
        "uvicorn.protocols.websockets",
        "uvicorn.protocols.websockets.auto",
        "uvicorn.lifespan",
        "uvicorn.lifespan.on",
        "uvicorn.lifespan.off",
        "fastapi",
        "starlette",
        "starlette.middleware",
        "starlette.middleware.cors",
        "starlette.responses",
        "pydantic",
        "pydantic_core",
        "requests",
        "charset_normalizer",
        "cryptography",
        "gmssl",
        "ddddocr",
        "onnxruntime",
        "PIL",
        "path_utils",
        "urp_client",
        "wfw_client",
        "ele_client",
        "ele_history",
        "card_bookkeeping",
        "course_grabber",
        "auth_hub",
        "crypto_store",
        "calendar_exporter",
    ]

    # 排除与本项目无关的大型第三方库，避免 Qt 冲突与巨型体积膨胀
    excludes = [
        "PyQt5",
        "PyQt6",
        "PySide2",
        "PySide6",
        "shiboken6",
        "tkinter",
        "_tkinter",
        "matplotlib",
        "seaborn",
        "scipy",
        "torch",
        "torchvision",
        "torchaudio",
        "moviepy",
        "pygame",
        "imageio",
        "imageio_ffmpeg",
        "IPython",
        "ipykernel",
        "jupyter",
        "zmq",
        "pyzmq",
        "tensorflow",
        "tensorboard",
        "playwright",
        "mitmproxy",
        "mitmproxy_rs",
        "frida",
        "androguard",
        "apkInspector",
    ]

    cmd = [
        python_exe,
        "-m",
        "PyInstaller",
        "--name=scu-urp-service",
        "--onefile",
        "--clean",
        f"--distpath={str(bin_dir)}",
        f"--workpath={str(build_dir)}",
        f"--specpath={str(build_dir)}",
        f"--paths={str(server_dir)}",
    ]

    # 添加排除模块
    for exc in excludes:
        cmd.append(f"--exclude-module={exc}")

    # 添加 ddddocr 的 onnx 模型文件
    for onnx_file in ddddocr_dir.glob("*.onnx"):
        cmd.append(f"--add-data={str(onnx_file)};ddddocr")

    # 添加 hidden imports
    for hi in hidden_imports:
        cmd.append(f"--hidden-import={hi}")

    # 入口脚本
    entry_point = server_dir / "app.py"
    cmd.append(str(entry_point))

    print("[Build] 正在执行 PyInstaller 构建，请稍候...")
    print(" ".join(cmd[:10]) + " ...")

    build_res = subprocess.run(cmd)
    if build_res.returncode != 0:
        print("[Build Error] PyInstaller 构建失败！")
        return build_res.returncode

    exe_target = bin_dir / "scu-urp-service.exe"
    if exe_target.exists():
        size_mb = exe_target.stat().st_size / (1024 * 1024)
        print(f"[Build Success] 独立可执行程序构建成功！")
        print(f"[Build Success] 产物路径: {exe_target}")
        print(f"[Build Success] 文件大小: {size_mb:.2f} MB")
        return 0
    else:
        print("[Build Error] 未在目标目录发现生成的 exe 文件！")
        return 1


if __name__ == "__main__":
    sys.exit(main())
