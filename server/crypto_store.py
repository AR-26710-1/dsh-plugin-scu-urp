"""
本地加密凭据存储模块
使用 Fernet 对本地存储的学号与密码进行对称加密，避免明文泄露。
"""
import base64
import hashlib
import json
import os
import platform
from pathlib import Path
from typing import Optional, Dict, Any
from cryptography.fernet import Fernet

CRED_FILE_PATH = Path(__file__).resolve().parent / ".credentials.json"

def _get_machine_key() -> bytes:
    """生成基于机器特征的对称加密密钥"""
    machine_id = f"{platform.node()}-{platform.machine()}-SCU-DSH-KEY"
    key_hash = hashlib.sha256(machine_id.encode("utf-8")).digest()
    return base64.urlsafe_b64encode(key_hash)

class CredentialStore:
    def __init__(self, file_path: Path = CRED_FILE_PATH):
        self.file_path = file_path
        self.fernet = Fernet(_get_machine_key())

    def save_credentials(self, username: str, password: str, remember: bool = True) -> bool:
        """加密并保存学号与密码"""
        try:
            raw_data = json.dumps({"username": username, "password": password, "remember": remember, "authType": "password"}).encode("utf-8")
            encrypted = self.fernet.encrypt(raw_data)
            with open(self.file_path, "wb") as f:
                f.write(encrypted)
            return True
        except Exception as e:
            print(f"[CryptoStore] 保存凭据失败: {e}")
            return False

    def save_session_credentials(self, cookies: dict, username: str = "", student_name: str = "", auth_type: str = "sso_qrcode") -> bool:
        """加密并保存扫码授权获取的持久化会话凭据与用户信息"""
        try:
            raw_data = json.dumps({
                "username": username,
                "studentName": student_name,
                "cookies": cookies,
                "authType": auth_type,
                "remember": True
            }).encode("utf-8")
            encrypted = self.fernet.encrypt(raw_data)
            with open(self.file_path, "wb") as f:
                f.write(encrypted)
            return True
        except Exception as e:
            print(f"[CryptoStore] 保存会话凭据失败: {e}")
            return False

    def load_credentials(self) -> Optional[Dict[str, Any]]:
        """读取并解密学号与密码"""
        if not self.file_path.exists():
            return None
        try:
            with open(self.file_path, "rb") as f:
                encrypted = f.read()
            decrypted = self.fernet.decrypt(encrypted)
            data = json.loads(decrypted.decode("utf-8"))
            if data.get("remember", False):
                return data
            return None
        except Exception as e:
            print(f"[CryptoStore] 读取凭据失败或已被破坏: {e}")
            return None

    def clear_credentials(self) -> bool:
        """清除本地保存的凭据"""
        try:
            if self.file_path.exists():
                os.remove(self.file_path)
            return True
        except Exception as e:
            print(f"[CryptoStore] 清除凭据失败: {e}")
            return False
