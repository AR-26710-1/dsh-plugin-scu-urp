"""
四川大学宿舍电费系统 (SCU Electricity) API 客户端
基于 ELECTRICITY_SPEC.md 规范与竹云 IDaaS 统一身份认证：
- 查询当前宿舍【空调电费】与【照明电费】
- 跨校区/楼栋/单元/房间层级字典查询与一键切换绑定房间
- 支持由统一认证中枢 (Auth Hub) 注入已认证会话，实现零二次登录
"""
import os
import sys
import json
import re
from typing import Dict, Any, Optional, Tuple, List

import requests

BASE_PAYAPP = "https://payapp.scu.edu.cn"


class SCUElectricityClient:
    def __init__(self, session: Optional[requests.Session] = None):
        self.session = session or requests.Session()
        self.session.trust_env = False
        self.session.headers.update({
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            ),
            "Content-Type": "application/json",
            "Referer": f"{BASE_PAYAPP}/eleFees/air/home"
        })
        self.cus_no: str = ""
        self.cus_name: str = ""
        self.is_logged_in: bool = False

    def update_session(self, session: requests.Session, cus_no: str = "", cus_name: str = ""):
        """从统一认证中枢注入已认证的会话"""
        self.session = session
        self.session.trust_env = False
        if cus_no:
            self.cus_no = cus_no
        if cus_name:
            self.cus_name = cus_name
        self.is_logged_in = True

    def set_credentials(self, cus_no: str, cus_name: str, cookies: Optional[dict] = None):
        """恢复缓存凭据"""
        self.cus_no = cus_no
        self.cus_name = cus_name
        if cookies:
            self.session.cookies.update(cookies)
        self.is_logged_in = bool(cus_no and cookies)

    def _ensure_user_info(self):
        """确保 cus_no 与 cus_name 已提取"""
        if not self.cus_no:
            r_w = self.session.get(f"{BASE_PAYAPP}/eleFees/oauth/airWarrant", allow_redirects=True, timeout=12)
            html = r_w.text
            m_no = re.search(r"var cusNo\s*=\s*'([^']*)'", html) or re.search(r'id="cusNo"[^>]*value="([^"]*)"', html)
            m_name = re.search(r"var cusName\s*=\s*'([^']*)'", html) or re.search(r'id="cusName"[^>]*value="([^"]*)"', html)
            if m_no:
                self.cus_no = m_no.group(1)
            if m_name:
                self.cus_name = m_name.group(1)

    def query_room_info(self, fee_type: int = 1) -> Optional[Dict[str, Any]]:
        """
        查询指定类型的电费详情
        fee_type: 1 为宿舍照明电(日常用电), 2 为空调动力电
        """
        self._ensure_user_info()
        if not self.cus_no:
            return None

        url = f"{BASE_PAYAPP}/eleFees/electric/queryRoomInfo"
        payload = {
            "cusNo": self.cus_no,
            "type": fee_type,
            "cusName": self.cus_name
        }
        try:
            r = self.session.post(url, json=payload, timeout=10)
            res = r.json()
            if res.get("respCode") == "00":
                return res.get("data")
            return None
        except Exception as e:
            print(f"[EleClient] 查询电费失败 (type={fee_type}): {e}")
            return None

    def query_electricity(self) -> Dict[str, Any]:
        """
        聚合查询当前宿舍的【宿舍照明电】与【空调动力电】
        修正：川大官方接口中 type=1 为照明电，type=2 为空调动力电
        """
        self._ensure_user_info()
        if not self.cus_no:
            return {
                "success": False,
                "message": "电费身份未绑定或会话已过期，请重新登录统一认证",
                "cusNo": "",
                "cusName": "",
                "air": None,
                "light": None
            }

        # 准确映射：1 为宿舍照明日常电，2 为空调动力电
        light_data = self.query_room_info(fee_type=1)
        air_data = self.query_room_info(fee_type=2)

        if not air_data and not light_data:
            return {
                "success": False,
                "message": "未能拉取到宿舍电费数据，可能电费系统正在结算或会话需刷新",
                "cusNo": self.cus_no,
                "cusName": self.cus_name,
                "air": None,
                "light": None
            }

        # 提取公共房间展示信息
        sample = air_data or light_data or {}
        room_display = f"{sample.get('schoolName', '')} {sample.get('regName', '')} {sample.get('unitName') or ''} {sample.get('roomNo', '')}".strip()

        return {
            "success": True,
            "cusNo": self.cus_no,
            "cusName": self.cus_name,
            "roomDisplay": room_display,
            "schoolName": sample.get("schoolName", ""),
            "regName": sample.get("regName", ""),
            "unitName": sample.get("unitName", ""),
            "roomNo": sample.get("roomNo", ""),
            "air": {
                "balance": float(air_data.get("balance", 0)) if air_data else None,
                "price": float(air_data.get("price", 0.5464)) if air_data else None,
                "raw": air_data
            } if air_data else None,
            "light": {
                "balance": float(light_data.get("balance", 0)) if light_data else None,
                "price": float(light_data.get("price", 0.5464)) if light_data else None,
                "raw": light_data
            } if light_data else None
        }

    def get_campuses(self) -> List[Dict[str, Any]]:
        """获取校区列表 (望江、华西、江安)"""
        url = f"{BASE_PAYAPP}/eleFees/electric/getCampus"
        try:
            r = self.session.post(url, json={}, timeout=10)
            res = r.json()
            if res.get("respCode") == "00":
                return (res.get("data") or {}).get("datas", [])
            return []
        except Exception:
            return []

    def get_buildings(self, school_code: str) -> List[Dict[str, Any]]:
        """根据校区代码获取楼栋列表"""
        url = f"{BASE_PAYAPP}/eleFees/electric/getArchitecture"
        try:
            r = self.session.post(url, json={"schoolCode": str(school_code)}, timeout=10)
            res = r.json()
            if res.get("respCode") == "00":
                return (res.get("data") or {}).get("datas", [])
            return []
        except Exception:
            return []

    def get_units(self, school_code: str, reg_code: str) -> List[Dict[str, Any]]:
        """根据校区与楼栋代码获取单元列表 (部分楼栋无单元)"""
        url = f"{BASE_PAYAPP}/eleFees/electric/getUnit"
        try:
            r = self.session.post(url, json={"schoolCode": str(school_code), "regCode": str(reg_code)}, timeout=10)
            res = r.json()
            if res.get("respCode") == "00":
                return (res.get("data") or {}).get("datas", [])
            return []
        except Exception:
            return []

    def verify_room(self, school_code: str, reg_code: str, unit_code: str, room_no: str) -> Tuple[bool, str]:
        """
        校验并切换绑定到新房间
        """
        self._ensure_user_info()
        if not self.cus_no:
            return False, "用户未登录电费系统"

        url = f"{BASE_PAYAPP}/eleFees/electric/verificationRoom"
        payload = {
            "cusNo": self.cus_no,
            "type": 1,
            "cusName": self.cus_name,
            "schoolCode": str(school_code),
            "regCode": str(reg_code),
            "unitCode": str(unit_code) if unit_code else "",
            "roomNo": str(room_no).strip()
        }
        try:
            r = self.session.post(url, json=payload, timeout=10)
            res = r.json()
            if res.get("respCode") == "00" and (res.get("data") or {}).get("status", False):
                return True, "切换宿舍房间成功"
            return False, res.get("respDesc") or "校验宿舍房间失败，请核对房间号"
        except Exception as e:
            return False, f"房间校验请求异常: {str(e)}"

    def create_recharge_order(self, fee_type: int = 1, amount: float = 10.0) -> Dict[str, Any]:
        """
        创建宿舍电费充值订单并请求四川大学统一支付网关
        fee_type: 1 为宿舍照明用电, 2 为空调动力用电
        amount: 充值金额 (1 ~ 500 元)
        """
        self._ensure_user_info()
        if not self.cus_no:
            return {"success": False, "message": "电费身份未绑定或会话已过期，请重新登录统一认证"}

        amt = round(float(amount), 2)
        if amt < 1 or amt > 500:
            return {"success": False, "message": "充值金额须在 1 ~ 500 元之间"}

        url = f"{BASE_PAYAPP}/eleFees/electric/toPay"
        payload = {
            "cusNo": self.cus_no,
            "rechargeAmt": amt,
            "type": fee_type
        }
        try:
            r = self.session.post(url, json=payload, timeout=12)
            res = r.json()
            if res.get("respCode") != "00":
                return {"success": False, "message": res.get("respDesc", "创建充值订单失败")}

            data = res.get("data", {})
            pay_url = data.get("payUrl", "https://pay.scu.edu.cn/paycenter/gateway_web")
            order_json_str = data.get("json", "")
            signature = data.get("signature", "")

            order_info = {}
            try:
                order_info = json.loads(order_json_str)
            except Exception:
                pass

            # 进一步向川大统一支付网关发起表单提交，解析收银台页面与支付渠道
            gw_resp = self.session.post(pay_url, data={"json": order_json_str, "signature": signature}, timeout=15)
            gw_html = gw_resp.text

            # 提取网关收银台关键特征
            qr_match = re.search(r'src=["\'](data:image/[^"\']+|https?://[^"\']+qr[^"\']+)["\']', gw_html, re.I) or re.search(r'id="qrCode"[^>]*src=["\']([^"\']+)["\']', gw_html)
            qr_code_url = qr_match.group(1) if qr_match else ""

            # 提取直接扫码支付的 code_url 或者微信/银联支付链接
            code_url_match = re.search(r'(weixin://wxpay/bizpayurl\?[^"\'\s<>]+)', gw_html) or re.search(r'var codeUrl\s*=\s*["\']([^"\']+)["\']', gw_html)
            pay_code_url = code_url_match.group(1) if code_url_match else ""

            return {
                "success": True,
                "orderNo": order_info.get("orderno", ""),
                "amount": amt,
                "feeType": "宿舍照明电" if fee_type == 1 else "空调动力电",
                "type": fee_type,
                "roomName": order_info.get("feename", ""),
                "userName": order_info.get("name", self.cus_name),
                "payUrl": pay_url,
                "postData": {
                    "json": order_json_str,
                    "signature": signature
                },
                "qrCode": qr_code_url,
                "codeUrl": pay_code_url,
                "gatewayHtmlSnippet": gw_html[:5000],
                "message": "充值订单创建成功"
            }
        except Exception as e:
            return {"success": False, "message": f"创建电费充值订单异常: {str(e)}"}



# 全局单例
ele_client = SCUElectricityClient()
