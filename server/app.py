"""
DeepSeek Harness - 四川大学教务系统 (URP) 与宿舍电费本地适配器服务
运行于本地 127.0.0.1:48080，桥接 DeepSeek Harness 插件与四川大学统一身份认证

核心能力：
- 竹云 IDaaS 统一身份认证中枢调度 (Auth Hub)
- 国密 SM2 自动过验证码登录 + 动态扫码登录
- 一次统一认证，教务系统 (URP) 与宿舍电费系统 (SCU Electricity) 双向自动激活并零二次登录
- 保留教务系统原生独立密码登录作为向后兼容通道
- 10 分钟自动静默保活与全天候透明重连
"""
import asyncio
import os
import json
import html
from contextlib import asynccontextmanager
import uvicorn
from fastapi import FastAPI, HTTPException, Body, Response, Query, Request
from fastapi.responses import HTMLResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List, Dict, Any

from crypto_store import CredentialStore
from urp_client import SCUUrpClient
from ele_client import ele_client
from wfw_client import wfw_client
from auth_hub import auth_hub
from calendar_exporter import generate_ics
from ele_history import record_snapshot, get_electricity_trend
from card_bookkeeping import analyze_card_records, save_card_note
from course_grabber import (
    grabber_manager,
    PHASE_META,
    CourseItem,
    GrabConfig,
    GrabStatus,
)

cred_store = CredentialStore()
client = SCUUrpClient()


def init_credentials_on_startup():
    """启动时自动检查是否有持久化的本地凭据或已保存会话并尝试静默恢复"""
    initial_creds = cred_store.load_credentials()
    if not initial_creds:
        return

    auth_type = initial_creds.get("authType", "unified_sso")
    username = initial_creds.get("username", "")
    password = initial_creds.get("password", "")
    student_name = initial_creds.get("studentName", "")
    cus_no = initial_creds.get("cusNo", "")
    cus_name = initial_creds.get("cusName", "")

    if auth_type == "unified_sso" and username and password:
        client.username = username
        client.student_name = student_name
        ele_client.cus_no = cus_no or username
        ele_client.cus_name = cus_name or student_name
    elif auth_type == "unified_sso_qrcode":
        if initial_creds.get("cookies"):
            client.load_session_cookies(initial_creds["cookies"])
            client.username = username
            client.student_name = student_name
        if initial_creds.get("eleCookies"):
            ele_client.set_credentials(cus_no, cus_name, initial_creds.get("eleCookies"))
    elif auth_type == "legacy_urp":
        if initial_creds.get("cookies"):
            client.load_session_cookies(initial_creds["cookies"])
        if username and password:
            client.update_credentials(username, password)
        client.username = username
        client.student_name = student_name


init_credentials_on_startup()


async def _heartbeat_loop():
    """后台轻量心跳探针，每 10 分钟检测并保活教务处与电费系统 Session"""
    while True:
        try:
            await asyncio.sleep(600)
            creds = cred_store.load_credentials()
            if creds:
                auth_type = creds.get("authType", "unified_sso")
                if auth_type == "unified_sso" and creds.get("username") and creds.get("password"):
                    # 若会话失效，自动通过统一认证静默刷新
                    if not client.verify_session_alive():
                        try:
                            token = auth_hub.login_by_password(creds["username"], creds["password"])
                            ok_urp, _, u_data = auth_hub.activate_urp_session(token)
                            if ok_urp:
                                client.update_session(u_data["session"], u_data["username"], u_data["studentName"])
                            ok_ele, _, e_data = auth_hub.activate_electricity_session(token)
                            if ok_ele:
                                ele_client.update_session(e_data["session"], e_data["cusNo"], e_data["cusName"])
                                wfw_client.update_session(e_data["session"])
                        except Exception:
                            pass
                else:
                    client.keep_alive()
        except asyncio.CancelledError:
            break
        except Exception:
            pass


@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(_heartbeat_loop())
    yield
    task.cancel()


app = FastAPI(title="SCU URP & Electricity Harness Bridge", version="2.0.0", lifespan=lifespan)

# 启用 CORS 允许 Harness 客户端跨域访问
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class LoginRequest(BaseModel):
    username: str
    password: str
    authType: str = "unified_sso"  # "unified_sso" (统一认证，推荐) | "legacy_urp" (教务独立密码)
    remember: bool = True


@app.get("/api/status")
async def get_status():
    """获取当前服务与各子系统登录状态"""
    creds = cred_store.load_credentials()
    has_saved_creds = bool(creds and (creds.get("username") or creds.get("cookies")))
    auth_type = creds.get("authType", "unified_sso") if creds else "unified_sso"
    
    return {
        "status": "online",
        "hasCredentials": has_saved_creds,
        "authType": auth_type,
        "username": client.username if has_saved_creds else "",
        "isLoggedIn": client.is_logged_in,
        "studentName": client.student_name,
        "electricity": {
            "isLoggedIn": ele_client.is_logged_in,
            "cusNo": ele_client.cus_no,
            "cusName": ele_client.cus_name
        },
        "microservices": {
            "isReady": True
        }
    }


@app.get("/api/auth/saved-credentials")
async def get_saved_credentials():
    """读取本地基于硬件特征加密安全保存的账号凭据，供前端快捷填入"""
    creds = cred_store.load_credentials()
    if not creds:
        return {"hasSaved": False, "username": "", "password": "", "authType": "unified_sso", "studentName": ""}

    username = creds.get("username", "")
    password = creds.get("password", "")
    auth_type = creds.get("authType", "unified_sso")
    student_name = creds.get("studentName", "")

    return {
        "hasSaved": bool(username and password),
        "username": username,
        "password": password,
        "authType": auth_type,
        "studentName": student_name
    }


# ================== 统一身份认证扫码登录通道 ==================

@app.get("/api/auth/qrcode/new")
async def create_sso_qrcode():
    """获取四川大学统一身份认证 (竹云 IDaaS) 动态二维码 (微川大 / 智慧川大 APP 扫码)"""
    try:
        data = auth_hub.start_qrcode_session()
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取统一认证动态二维码失败: {str(e)}")


@app.get("/api/auth/qrcode/status")
async def check_sso_qrcode_status(code: str = Query(..., description="临时二维码标识")):
    """
    轮询检查统一认证扫码状态
    扫码确认后自动并行换取教务处与电费系统会话，实现零二次登录
    """
    status, msg, access_token = auth_hub.check_qrcode_status(code)
    if status == "SUCCESS" and access_token:
        # 1. 激活教务处会话
        ok_urp, msg_urp, u_data = auth_hub.activate_urp_session(access_token)
        if ok_urp:
            client.update_session(u_data["session"], u_data["username"], u_data["studentName"])

        # 2. 激活电费系统会话与微服务系统
        ok_ele, msg_ele, e_data = auth_hub.activate_electricity_session(access_token)
        if ok_ele:
            ele_client.update_session(e_data["session"], e_data["cusNo"], e_data["cusName"])
            wfw_client.update_session(e_data["session"])

        # 3. 持久化存储两套会话凭据
        cred_store.save_session_credentials(
            cookies=u_data.get("cookies", {}),
            username=u_data.get("username", "") or e_data.get("cusNo", ""),
            student_name=u_data.get("studentName", "") or e_data.get("cusName", ""),
            auth_type="unified_sso_qrcode",
            cus_no=e_data.get("cusNo", ""),
            cus_name=e_data.get("cusName", ""),
            ele_cookies=e_data.get("cookies", {})
        )

        return {
            "status": "SUCCESS",
            "message": "统一身份认证扫码成功，已自动关联教务处与宿舍电费！",
            "studentName": client.student_name or ele_client.cus_name,
            "username": client.username or ele_client.cus_no,
            "electricity": {
                "cusNo": ele_client.cus_no,
                "cusName": ele_client.cus_name
            }
        }

    return {
        "status": status,
        "message": msg
    }


# ================== 统一身份认证与教务登录入口 ==================

@app.post("/api/login")
@app.post("/api/auth/login")
async def login_api(req: LoginRequest):
    """
    多模态统一登录接口：
    1. 默认 authType="unified_sso" (统一身份认证，国密 SM2 + 本地自动识别验证码，一键打通教务与电费)
    2. 可选 authType="legacy_urp" (教务系统原生独立密码，兼容旧习惯)
    """
    username = req.username.strip()
    password = req.password.strip()

    if not username or not password:
        raise HTTPException(status_code=400, detail="学号或密码不能为空")

    if req.authType == "unified_sso":
        try:
            # 1. 登录统一认证并换取 access_token
            access_token = auth_hub.login_by_password(username, password)
            
            # 2. 自动并行激活教务处会话
            ok_urp, msg_urp, u_data = auth_hub.activate_urp_session(access_token)
            if ok_urp:
                client.update_session(u_data["session"], u_data.get("username") or username, u_data.get("studentName", ""))
            
            # 3. 自动并行激活电费系统会话与微服务系统
            ok_ele, msg_ele, e_data = auth_hub.activate_electricity_session(access_token)
            if ok_ele:
                ele_client.update_session(e_data["session"], e_data.get("cusNo") or username, e_data.get("cusName", ""))
                wfw_client.update_session(e_data["session"])

            student_name = client.student_name or ele_client.cus_name or username

            # 4. 记住凭据 (硬件特征加密保存)
            if req.remember:
                cred_store.save_credentials(
                    username=username,
                    password=password,
                    remember=True,
                    auth_type="unified_sso",
                    student_name=student_name
                )
            else:
                cred_store.clear_credentials()

            return {
                "success": True,
                "authType": "unified_sso",
                "message": "统一身份认证成功！教务处与电费系统已无缝打通",
                "studentName": student_name,
                "username": username,
                "urpReady": client.is_logged_in,
                "electricityReady": ele_client.is_logged_in,
                "cusNo": ele_client.cus_no,
                "cusName": ele_client.cus_name
            }
        except RuntimeError as re_err:
            raise HTTPException(status_code=400, detail=str(re_err))
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"统一身份认证系统通信异常: {str(e)}")

    elif req.authType == "legacy_urp":
        # 原教务处独立密码通道 (向后兼容)
        client.update_credentials(username, password)
        ok, msg = client.login()
        if not ok:
            raise HTTPException(status_code=400, detail=f"教务系统原生登录失败: {msg}")

        if req.remember:
            cred_store.save_credentials(
                username=username,
                password=password,
                remember=True,
                auth_type="legacy_urp",
                student_name=client.student_name
            )
        else:
            cred_store.clear_credentials()

        return {
            "success": True,
            "authType": "legacy_urp",
            "message": "教务系统原生登录成功",
            "studentName": client.student_name,
            "username": client.username,
            "urpReady": True,
            "electricityReady": False
        }

    else:
        raise HTTPException(status_code=400, detail=f"不支持的认证类型: {req.authType}")


@app.post("/api/logout")
async def logout():
    """清除本地保存的凭据与各系统会话"""
    cred_store.clear_credentials()
    client.update_credentials("", "")
    client.is_logged_in = False
    client.student_name = ""
    client.session.cookies.clear()

    ele_client.cus_no = ""
    ele_client.cus_name = ""
    ele_client.is_logged_in = False
    ele_client.session.cookies.clear()

    return {"success": True, "message": "已成功清除本地凭据并退出所有系统"}


def ensure_authenticated():
    """保活检查：若未登录则自动使用存储的凭据或持久化会话静默登录"""
    if client.is_logged_in:
        return
    creds = cred_store.load_credentials()
    if not creds:
        raise HTTPException(status_code=401, detail="尚未配置账号凭据，请先在面板中完成统一认证")

    auth_type = creds.get("authType", "unified_sso")

    # 优先载入已保存的 Session Cookies
    if creds.get("cookies"):
        if client.load_session_cookies(creds["cookies"]):
            client.username = creds.get("username", "")
            client.student_name = creds.get("studentName", "")
            return

    # 若为统一认证账密凭据，执行自动静默登录与双向激活
    if auth_type == "unified_sso" and creds.get("username") and creds.get("password"):
        try:
            token = auth_hub.login_by_password(creds["username"], creds["password"])
            ok_urp, _, u_data = auth_hub.activate_urp_session(token)
            if ok_urp:
                client.update_session(u_data["session"], u_data.get("username") or creds["username"], u_data.get("studentName", ""))
            ok_ele, _, e_data = auth_hub.activate_electricity_session(token)
            if ok_ele:
                ele_client.update_session(e_data["session"], e_data.get("cusNo") or creds["username"], e_data.get("cusName", ""))
            return
        except Exception as e:
            raise HTTPException(status_code=401, detail=f"统一认证静默续期失败: {str(e)}，请重新登录")

    # 若为旧教务账密凭据
    if creds.get("username") and creds.get("password"):
        client.update_credentials(creds.get("username", ""), creds.get("password", ""))
        ok, msg = client.login()
        if ok:
            return
        raise HTTPException(status_code=401, detail=f"自动登录教务处失败: {msg}")

    raise HTTPException(status_code=401, detail="当前会话已失效，请重新登录")


def ensure_electricity_authenticated(force_refresh: bool = False):
    """确保电费系统会话已就绪，若未就绪或过期自动使用统一凭据静默激活"""
    if not force_refresh and ele_client.is_logged_in and ele_client.cus_no:
        return
    creds = cred_store.load_credentials()
    if not creds:
        raise HTTPException(status_code=401, detail="尚未完成统一身份认证，无法查询宿舍电费")

    auth_type = creds.get("authType", "unified_sso")

    # 非强制刷新时，优先尝试恢复已保存的电费 cookies
    if not force_refresh and creds.get("eleCookies") and creds.get("cusNo"):
        ele_client.set_credentials(creds["cusNo"], creds.get("cusName", ""), creds.get("eleCookies"))
        if ele_client.is_logged_in:
            return

    # 若为统一认证账密，自动静默激活电费系统
    if auth_type == "unified_sso" and creds.get("username") and creds.get("password"):
        try:
            token = auth_hub.login_by_password(creds["username"], creds["password"])
            ok_ele, msg_ele, e_data = auth_hub.activate_electricity_session(token)
            if ok_ele:
                ele_client.update_session(e_data["session"], e_data.get("cusNo") or creds["username"], e_data.get("cusName", ""))
                try:
                    creds["eleCookies"] = e_data["session"].cookies.get_dict()
                    creds["cusNo"] = e_data.get("cusNo") or creds["username"]
                    creds["cusName"] = e_data.get("cusName", "")
                    cred_store.save_credentials(creds)
                except Exception:
                    pass
                return
            raise HTTPException(status_code=500, detail=f"激活电费会话失败: {msg_ele}")
        except Exception as e:
            raise HTTPException(status_code=401, detail=f"统一认证登录电费系统失败: {str(e)}")

    raise HTTPException(status_code=401, detail="电费会话未就绪，请在设置中通过统一身份认证登录")


# ================== 宿舍电费查询业务 API ==================

@app.get("/api/electricity/status")
async def get_electricity_status_api():
    """获取当前宿舍的空调电费与照明电费数据 (自动利用统一认证凭据免二次登录并打点持久化)"""
    ensure_electricity_authenticated()
    data = ele_client.query_electricity()
    if not data.get("success"):
        # 远端会话可能已过期，尝试使用已保存统一凭据静默重签一次
        try:
            ensure_electricity_authenticated(force_refresh=True)
            data = ele_client.query_electricity()
        except Exception:
            pass
    if not data.get("success"):
        raise HTTPException(status_code=500, detail=data.get("message") or "获取电费信息失败")
    
    # 自动持久化历史抄表打点
    try:
        air_b = data.get("air", {}).get("balance") if data.get("air") else None
        light_b = data.get("light", {}).get("balance") if data.get("light") else None
        record_snapshot(data.get("roomDisplay", ""), air_b, light_b, 0.5464)
    except Exception as e:
        print(f"[EleHistory] 自动记录快照异常: {e}")

    return data


@app.get("/api/electricity/history")
async def get_electricity_history_api(days: int = Query(default=14, description="查询近N天耗电历史")):
    """获取宿舍电费历史抄表快照、每日耗电量变化与趋势分析数据"""
    try:
        trend = get_electricity_trend(days=max(3, min(90, days)))
        return trend
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取电费历史分析异常: {str(e)}")


@app.get("/api/electricity/campuses")
async def get_electricity_campuses():
    """获取电费系统的校区列表"""
    ensure_electricity_authenticated()
    datas = ele_client.get_campuses()
    return {"campuses": datas}


@app.get("/api/electricity/buildings")
async def get_electricity_buildings(schoolCode: str = Query(..., description="校区代码")):
    """根据校区代码获取楼栋列表"""
    ensure_electricity_authenticated()
    datas = ele_client.get_buildings(schoolCode)
    return {"buildings": datas}


@app.get("/api/electricity/units")
async def get_electricity_units(
    schoolCode: str = Query(..., description="校区代码"),
    regCode: str = Query(..., description="楼栋代码")
):
    """根据校区与楼栋代码获取单元列表"""
    ensure_electricity_authenticated()
    datas = ele_client.get_units(schoolCode, regCode)
    return {"units": datas}


@app.post("/api/electricity/verify-room")
async def verify_room_api(payload: dict = Body(...)):
    """校验并切换绑定到新宿舍房间"""
    ensure_electricity_authenticated()
    school_code = payload.get("schoolCode", "")
    reg_code = payload.get("regCode", "")
    unit_code = payload.get("unitCode", "")
    room_no = payload.get("roomNo", "")

    if not school_code or not reg_code or not room_no:
        raise HTTPException(status_code=400, detail="校区、楼栋与房间号均不能为空")

    ok, msg = ele_client.verify_room(school_code, reg_code, unit_code, room_no)
    if not ok:
        raise HTTPException(status_code=400, detail=msg)

    # 切换成功后立即拉取一次最新电量
    latest = ele_client.query_electricity()
    return {
        "success": True,
        "message": msg,
        "electricity": latest
    }


class ElectricityRechargeRequest(BaseModel):
    type: int = 1  # 1 为宿舍照明电费, 2 为空调动力电费
    amount: float = 10.0


# 宿舍电费待支付订单缓存注册表 (解决跨域弹窗拦截与 Mixed Content 降级参数丢失问题)
RECHARGE_ORDERS: Dict[str, Dict[str, Any]] = {}


@app.post("/api/electricity/recharge")
async def recharge_electricity_api(req: ElectricityRechargeRequest):
    """
    创建宿舍电费在线充值订单并获取四川大学官方统一支付网关凭证与收银台表单
    支持宿舍照明电 (type=1) 与空调动力电 (type=2)，金额 1~500 元
    """
    ensure_electricity_authenticated()
    if req.amount < 1 or req.amount > 500:
        raise HTTPException(status_code=400, detail="单次充值金额须在 1 ~ 500 元范围之内")
    res = ele_client.create_recharge_order(fee_type=req.type, amount=req.amount)
    if not res.get("success"):
        raise HTTPException(status_code=500, detail=res.get("message", "创建电费充值订单失败"))
    order_no = res.get("orderNo")
    if order_no:
        RECHARGE_ORDERS[order_no] = res
    res["gatewayUrl"] = f"http://127.0.0.1:48080/api/electricity/pay_gateway?orderNo={order_no}"
    return res


@app.get("/api/electricity/pay_gateway", response_class=HTMLResponse)
async def electricity_pay_gateway_api(orderNo: str = Query(..., description="电费充值订单编号")):
    """
    提供川大官方收银台自提交中转页面，彻底解决浏览器 Mixed Content 降级、弹窗拦截与跨域参数丢失问题
    """
    order = RECHARGE_ORDERS.get(orderNo)
    if not order:
        return HTMLResponse(
            content="""<!DOCTYPE html><html><head><meta charset='utf-8'><title>订单失效</title></head>
            <body style='font-family:sans-serif;text-align:center;padding:50px;'>
            <h3 style='color:#ef4444;'>未找到对应的电费充值订单或会话已过期</h3>
            <p style='color:#71717a;'>请返回教务处插件页面重新发起充值。</p>
            </body></html>""",
            status_code=404
        )

    pay_url = order.get("payUrl", "https://pay.scu.edu.cn/paycenter/gateway_web")
    post_data = order.get("postData", {})
    json_val = post_data.get("json", "")
    sig_val = post_data.get("signature", "")
    amount = order.get("amount", 0)
    fee_type = order.get("feeType", "宿舍用电")
    room_name = order.get("roomName", "")

    # HTML 属性安全转义，保留原始 Unicode 转义序列以匹配川大官方网关签名校验
    escaped_json = html.escape(json_val, quote=True)
    escaped_sig = html.escape(sig_val, quote=True)

    html_content = f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>正在连接四川大学官方支付收银台...</title>
  <style>
    * {{ box-sizing: border-box; }}
    body {{
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      margin: 0;
      padding: 20px;
      background: #fbfbfb;
      color: #18181b;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
    }}
    .card {{
      background: #ffffff;
      border: 1px solid rgba(125, 125, 125, 0.16);
      border-radius: 14px;
      padding: 36px 32px;
      max-width: 440px;
      width: 100%;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.05);
      text-align: center;
    }}
    .icon-box {{
      width: 54px;
      height: 54px;
      border-radius: 50%;
      background: rgba(16, 185, 129, 0.1);
      color: #10b981;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 16px auto;
      font-size: 24px;
    }}
    .title {{ font-size: 18px; font-weight: 600; margin: 0 0 8px 0; }}
    .subtitle {{ font-size: 13px; color: #71717a; margin: 0 0 20px 0; line-height: 1.5; }}
    .info-list {{
      background: rgba(125, 125, 125, 0.04);
      border: 1px solid rgba(125, 125, 125, 0.08);
      border-radius: 8px;
      padding: 14px 18px;
      font-size: 13px;
      text-align: left;
      margin-bottom: 24px;
      line-height: 1.8;
    }}
    .btn {{
      display: inline-block;
      width: 100%;
      padding: 12px 20px;
      background: #18181b;
      color: #ffffff;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: opacity 0.15s ease;
      text-decoration: none;
    }}
    .btn:hover {{ opacity: 0.9; }}
    .footer-tip {{ font-size: 11px; color: #a1a1aa; margin-top: 14px; }}
  </style>
</head>
<body>
  <div class="card">
    <div class="icon-box">⚡</div>
    <div class="title">正在安全进入四川大学收银台</div>
    <div class="subtitle">订单已成功创建，系统正在通过官方统一支付网关安全拉起收银台...</div>
    <div class="info-list">
      <div><strong>订单编号:</strong> {orderNo}</div>
      <div><strong>充值项目:</strong> {fee_type}</div>
      <div><strong>充值房间:</strong> {room_name}</div>
      <div><strong>支付金额:</strong> <span style="font-size: 16px; font-weight: 700; color: #ec1717;">¥ {amount:.2f} 元</span></div>
    </div>
    <form id="officialPayForm" method="POST" action="{pay_url}">
      <input type="hidden" name="json" value="{escaped_json}">
      <input type="hidden" name="signature" value="{escaped_sig}">
      <button type="submit" class="btn" id="submitBtn">立即前往四川大学官方收银台</button>
    </form>
    <div class="footer-tip">若浏览器未在 2 秒内自动跳转，请点击上方按钮前往支付</div>
  </div>
  <script>
    // 页面载入时立即自动在当前窗口原生提交，绝不触发弹窗拦截，100% 携带完整 POST body
    window.addEventListener('load', function() {{
      setTimeout(function() {{
        try {{
          var form = document.getElementById('officialPayForm');
          var btn = document.getElementById('submitBtn');
          if (form) {{
            if (btn) btn.innerText = '正在进入收银台...';
            form.submit();
          }}
        }} catch(e) {{
          console.error('自动提交失败:', e);
        }}
      }}, 50);
    }});
  </script>
</body>
</html>
"""
    return HTMLResponse(content=html_content)


# ================== 四川大学微服务 (一卡通与校园网) API ==================

class DeviceOfflineRequest(BaseModel):
    deviceId: str
    ip: Optional[str] = ""


@app.get("/api/wfw/card/status")
async def get_wfw_card_status_api(refresh: bool = Query(default=False, description="是否强制刷新")):
    """获取校园一卡通实时卡内物理余额、今日支出、近30天明细流水与卡片状态"""
    try:
        res = wfw_client.get_card_status(force_refresh=refresh)
        if not res.get("success"):
            # 若初次返回失败，尝试强制重新静默激活会话
            res = wfw_client.get_card_status(force_refresh=True)
        if not res.get("success"):
            raise HTTPException(status_code=500, detail=res.get("message", "获取一卡通信息失败"))
        return res
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"拉取一卡通微服务异常: {str(e)}")


class CardNoteRequest(BaseModel):
    recordId: str
    note: str
    tag: Optional[str] = ""


@app.get("/api/wfw/card/bookkeeping")
async def get_card_bookkeeping_api(refresh: bool = Query(default=False, description="是否强制刷新一卡通流水")):
    """获取校园一卡通消费记账统计、分类占比、近14天每日趋势与自定义备注"""
    try:
        card_res = wfw_client.get_card_status(force_refresh=refresh)
        if not card_res.get("success"):
            card_res = wfw_client.get_card_status(force_refresh=True)
        if not card_res.get("success"):
            raise HTTPException(status_code=500, detail=card_res.get("message", "获取校园卡流水失败"))
        
        records = card_res.get("records", [])
        analysis = analyze_card_records(records)
        analysis["balance"] = card_res.get("balance", "0.00")
        analysis["cardStatus"] = card_res.get("cardStatus", "正常")
        return analysis
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"一卡通记账分析异常: {str(e)}")


@app.post("/api/wfw/card/note")
async def update_card_note_api(payload: CardNoteRequest):
    """保存或更新单笔交易流水自定义记账备注与标签"""
    if not payload.recordId:
        raise HTTPException(status_code=400, detail="交易流水 ID 不能为空")
    try:
        ok = save_card_note(payload.recordId, payload.note, payload.tag or "")
        return {"success": ok, "message": "记账备注已保存" if ok else "保存失败"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"更新记账备注异常: {str(e)}")


@app.get("/api/wfw/network/status")
async def get_wfw_network_status_api(refresh: bool = Query(default=False, description="是否强制刷新")):
    """获取校园网在线终端列表、连接数配额、分配 IP 与 MAC 地址"""
    try:
        res = wfw_client.get_network_status(force_refresh=refresh)
        if not res.get("success"):
            res = wfw_client.get_network_status(force_refresh=True)
        if not res.get("success"):
            raise HTTPException(status_code=500, detail=res.get("message", "获取校园网设备列表失败"))
        return res
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"拉取校园网微服务异常: {str(e)}")


@app.post("/api/wfw/network/offline")
async def offline_wfw_device_api(req: DeviceOfflineRequest):
    """远程下线指定校园网在线终端设备并释放连接数"""
    if not req.deviceId:
        raise HTTPException(status_code=400, detail="设备 MAC (deviceId) 不能为空")
    try:
        res = wfw_client.offline_device(req.deviceId, req.ip or "")
        if not res.get("success"):
            raise HTTPException(status_code=500, detail=res.get("message", "下线终端失败"))
        return res
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"终端下线操作异常: {str(e)}")


# ================== 扩展微服务 API：微应用广场、校车、失物招领、图书馆 ==================

@app.get("/api/wfw/apps/all")
async def get_wfw_apps_all_api(refresh: bool = Query(default=False, description="是否强制刷新微应用广场")):
    """获取四川大学 9 大分类全量 60+ 微应用广场清单与认证跳转"""
    try:
        return wfw_client.get_app_square(force_refresh=refresh)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取全校微应用广场失败: {str(e)}")


@app.get("/api/wfw/apps/search")
async def search_wfw_apps_api(keyword: str = Query(default="", description="搜索关键词")):
    """按关键词在全校微应用中全局搜索"""
    try:
        results = wfw_client.search_apps(keyword)
        return {"success": True, "keyword": keyword, "count": len(results), "apps": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"搜索微应用失败: {str(e)}")


@app.get("/api/wfw/card/lost_found")
async def get_wfw_card_lost_found_api(student_id: str = Query(default="", description="自定义排查学号")):
    """获取全校一卡通失物招领最新列表并进行学号安全自查"""
    try:
        # 若未指定学号，默认自动匹配当前已认证用户的学号
        target_id = student_id.strip() or ele_client.cus_no or "2024141470117"
        return wfw_client.get_card_lost_found(my_student_id=target_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取失物招领异常: {str(e)}")


@app.get("/api/wfw/bus/schedule")
async def get_wfw_shuttle_bus_api():
    """获取望江、江安、华西校区间校园交通车时刻表与下一班车倒计时"""
    try:
        return wfw_client.get_shuttle_bus_schedule()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取校车时刻表异常: {str(e)}")


@app.get("/api/wfw/library/status")
async def get_wfw_library_status_api(refresh: bool = Query(default=False, description="是否强制刷新")):
    """获取图书馆读者证号、借阅额度、当前在借与欠费情况"""
    try:
        return wfw_client.get_library_status(force_refresh=refresh)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取图书馆状态异常: {str(e)}")



# ================== 教务处核心业务 API ==================

@app.get("/api/schedule")
async def get_schedule():
    """获取当前学期课表"""
    ensure_authenticated()
    try:
        return client.get_schedule()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取课表失败: {str(e)}")


@app.get("/api/grades")
async def get_grades():
    """获取全量成绩与 GPA 统计"""
    ensure_authenticated()
    try:
        return client.get_grades()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取成绩失败: {str(e)}")


@app.get("/api/exams")
async def get_exams():
    """获取考试日程"""
    ensure_authenticated()
    try:
        return client.get_exams()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取考试日程失败: {str(e)}")


@app.get("/api/schedule/export-ics")
async def export_schedule_ics(
    startDate: str = Query(default="2026-08-31", description="第一周周一公历日期 (YYYY-MM-DD)"),
    alarmMinutes: int = Query(default=15, description="课前提醒分钟数"),
    download: bool = Query(default=False, description="是否直接以文件下载形式响应"),
):
    """将课表导出为标准 iCalendar (.ics) 日历格式"""
    ensure_authenticated()
    try:
        schedule_data = client.get_schedule()
        ics_text, count = generate_ics(
            schedule_data,
            start_monday_str=startDate,
            alarm_minutes=alarmMinutes,
            calendar_name=f"川大课表 ({client.student_name or client.username})",
        )

        if download:
            headers = {
                "Content-Disposition": f'attachment; filename="scu_schedule_{startDate}.ics"',
                "Content-Type": "text/calendar; charset=utf-8",
            }
            return Response(content=ics_text.encode("utf-8"), headers=headers, media_type="text/calendar")

        return {
            "success": True,
            "eventCount": count,
            "startDate": startDate,
            "alarmMinutes": alarmMinutes,
            "icsContent": ics_text,
            "downloadUrl": f"/api/schedule/export-ics?startDate={startDate}&alarmMinutes={alarmMinutes}&download=true",
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"生成日历文件失败: {str(e)}")


@app.get("/api/grades/export-csv")
async def export_grades_csv(
    onlyRequired: bool = Query(default=False, description="是否仅导出必修课程"),
    download: bool = Query(default=False, description="是否直接以文件下载形式响应"),
):
    """将全量成绩导出为标准 UTF-8 BOM CSV/Excel 文件"""
    ensure_authenticated()
    try:
        data = client.get_grades()
        grades = data.get("grades", [])
        if onlyRequired:
            grades = [g for g in grades if g.get("isRequired")]

        rows = ["序号,学期,课程代码,课程名称,学分,课程性质,是否必修,成绩,等级,绩点,未通过原因"]
        for idx, g in enumerate(grades, 1):
            name_clean = f'"{g.get("name", "")}"' if "," in g.get("name", "") else g.get("name", "")
            row = [
                str(idx),
                g.get("term", ""),
                g.get("code", ""),
                name_clean,
                str(g.get("credit", 0.0)),
                g.get("property", ""),
                "是" if g.get("isRequired") else "否",
                str(g.get("score", "")),
                g.get("gradeLevel", ""),
                str(g.get("gpa", 0.0)),
                g.get("unpassReason", "") or "",
            ]
            rows.append(",".join(row))

        csv_text = "\ufeff" + "\r\n".join(rows)

        if download:
            filename = "scu_grades_required.csv" if onlyRequired else "scu_grades_all.csv"
            headers = {
                "Content-Disposition": f'attachment; filename="{filename}"',
                "Content-Type": "text/csv; charset=utf-8",
            }
            return Response(content=csv_text.encode("utf-8"), headers=headers, media_type="text/csv")

        return {
            "success": True,
            "totalExported": len(grades),
            "onlyRequired": onlyRequired,
            "downloadUrl": f"/api/grades/export-csv?onlyRequired={'true' if onlyRequired else 'false'}&download=true",
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"导出成绩单失败: {str(e)}")


@app.get("/api/classrooms/buildings")
async def get_classroom_buildings():
    """获取支持查询自习室的校区与各校区常用教学楼字典"""
    return {
        "campuses": client.SCU_CAMPUS_DICT,
        "buildings": client.SCU_BUILDINGS_DICT,
    }


@app.get("/api/classrooms/free")
async def get_free_classrooms_api(
    campus: str = Query(default="03", description="校区代码或名称，如 '03' 或 '江安'"),
    building: str = Query(default="301", description="教学楼代码或名称，如 '301' 或 '一教A座'"),
    date: Optional[str] = Query(default=None, description="查询日期，格式 YYYY-MM-DD，留空则为当天"),
    session: Optional[int] = Query(default=None, description="指定具体第几节 (1~12)"),
    timeSlot: Optional[str] = Query(default=None, description="指定时段，如 'morning', 'afternoon', 'evening', 'all'"),
    minCapacity: int = Query(default=0, description="最小座位容量过滤"),
    onlyFreeNow: bool = Query(default=False, description="是否仅展示目标时段空闲的教室"),
):
    """获取指定校区、教学楼、日期与精确时段/小节的空闲教室与 1~12 节占用矩阵"""
    ensure_authenticated()
    try:
        res = client.get_free_classrooms(
            campus=campus,
            building=building,
            query_date=date,
            session=session,
            time_slot=timeSlot,
            min_capacity=minCapacity,
            only_current_free=onlyFreeNow,
        )
        return res
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取空闲自习室信息失败: {str(e)}")


# ================== 课程随堂备忘与作业待办 API ==================
TODOS_FILE = os.path.join(os.path.dirname(__file__), "..", "data", "todos.json")

def _load_todos() -> List[Dict[str, Any]]:
    try:
        if os.path.exists(TODOS_FILE):
            with open(TODOS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
    except Exception:
        pass
    return []

def _save_todos(todos: List[Dict[str, Any]]) -> bool:
    try:
        os.makedirs(os.path.dirname(TODOS_FILE), exist_ok=True)
        with open(TODOS_FILE, "w", encoding="utf-8") as f:
            json.dump(todos, f, ensure_ascii=False, indent=2)
        return True
    except Exception:
        pass
    return False

@app.get("/api/todos")
async def get_todos_api():
    """获取所有课程随堂备忘录与作业待办"""
    return {"todos": _load_todos()}

@app.post("/api/todos")
async def save_todos_api(payload: dict = Body(...)):
    """保存或更新课程随堂备忘录与作业待办"""
    todos = payload.get("todos", [])
    _save_todos(todos)
    return {"success": True, "todos": todos}


# ================== 培养方案与均分测算模拟 API ==================
@app.get("/api/program/scheme")
async def get_program_scheme_api():
    """获取培养方案全景大纲与未来加权均分/GPA预测模拟数据"""
    ensure_authenticated()
    try:
        return client.get_study_plan()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取培养方案数据失败: {str(e)}")


# ================== SCU 智能选课与抢课引擎 API ==================

class GrabTaskAddRequest(BaseModel):
    courseId: str
    seqNo: str
    name: str
    teacher: Optional[str] = ""
    seatsFree: Optional[int] = 0
    capacity: Optional[int] = 0
    classroom: Optional[str] = ""
    planId: Optional[str] = ""
    schedule: Optional[str] = ""
    credit: Optional[float] = 0.0
    campus: Optional[str] = ""
    courseCategory: Optional[str] = ""
    restriction: Optional[str] = ""
    groupId: Optional[int] = 0
    raw: Optional[Dict[str, Any]] = None


class GrabTasksReorderRequest(BaseModel):
    orderedKcIds: List[str]


class GrabTasksClearRequest(BaseModel):
    onlyFinished: Optional[bool] = False


class GrabConfigUpdateRequest(BaseModel):
    sleepTime: Optional[float] = None
    sleepJitter: Optional[float] = None
    maxFailures: Optional[int] = None
    phase: Optional[str] = None
    majorId: Optional[str] = None


class GrabScheduledRequest(BaseModel):
    scheduledTime: str


@app.get("/api/grab/phases")
async def get_grab_phases_api():
    """获取四川大学支持的选课阶段元数据及当前选定阶段"""
    phases = list(PHASE_META.values())
    return {
        "currentPhase": grabber_manager.config.phase,
        "phases": phases,
    }


@app.get("/api/grab/major-id")
async def get_major_id_api(refresh: bool = Query(default=False, description="是否重新从教务处探测")):
    """获取当前学生的方案计划号 (fajhh)"""
    ensure_authenticated()
    major_id = grabber_manager.config.major_id
    if refresh or not major_id:
        try:
            detected = grabber_manager.fetch_major_id(client.session, auto_save=True)
            if detected:
                major_id = detected
        except Exception:
            pass
    return {
        "majorId": major_id or "",
        "username": client.username,
        "studentName": client.student_name,
    }


@app.get("/api/grab/search")
async def search_courses_api(
    keyword: str = Query(..., description="课程名称或课程号"),
    phase: str = Query(default="free", description="选课阶段 (free, plan, depart, school)"),
    majorId: Optional[str] = Query(default=None, description="自定义方案计划号"),
):
    """按关键词检索课程列表（含课余量、教师、排课时间、校区、容量等）"""
    ensure_authenticated()
    if not keyword.strip():
        return {"courses": [], "count": 0}
    try:
        fajhh = majorId.strip() if majorId else (grabber_manager.config.major_id or "")
        courses = grabber_manager.search_courses(
            session=client.session,
            keyword=keyword,
            phase=phase,
            major_id=fajhh,
        )
        data = []
        for c in courses:
            data.append({
                "kcId": c.kc_id,
                "displayId": c.display_id,
                "courseId": c.course_id,
                "seqNo": c.seq_no,
                "name": c.name,
                "teacher": c.teacher,
                "seatsFree": c.seats_free,
                "capacity": c.capacity,
                "classroom": c.classroom,
                "planId": c.plan_id,
                "schedule": c.schedule,
                "credit": c.credit,
                "campus": c.campus,
                "courseCategory": c.course_category,
                "restriction": c.restriction,
                "raw": c.raw,
            })
        return {
            "success": True,
            "keyword": keyword,
            "phase": phase,
            "count": len(data),
            "courses": data,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"检索课程失败: {str(e)}")


@app.get("/api/grab/selected")
async def get_selected_courses_api():
    """获取当前已选中的课程列表（用于周课表排课与冲突比对）"""
    ensure_authenticated()
    try:
        courses = grabber_manager.get_selected_courses(client.session)
        return {
            "success": True,
            "count": len(courses),
            "courses": courses,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取已选课程列表失败: {str(e)}")


@app.get("/api/grab/tasks")
async def get_grab_tasks_api():
    """获取当前抢课任务队列（含各任务状态、尝试次数、备选组 ID）"""
    tasks_data = []
    with grabber_manager._lock:
        for t in grabber_manager.tasks:
            c = t.course
            tasks_data.append({
                "kcId": t.kc_id,
                "status": t.status.value,
                "groupId": t.group_id,
                "attempts": t.attempts,
                "lastMessage": t.last_message,
                "createdAt": t.created_at,
                "updatedAt": t.updated_at,
                "course": {
                    "kcId": c.kc_id,
                    "displayId": c.display_id,
                    "courseId": c.course_id,
                    "seqNo": c.seq_no,
                    "name": c.name,
                    "teacher": c.teacher,
                    "seatsFree": c.seats_free,
                    "capacity": c.capacity,
                    "classroom": c.classroom,
                    "planId": c.plan_id,
                    "schedule": c.schedule,
                    "credit": c.credit,
                    "campus": c.campus,
                    "courseCategory": c.course_category,
                    "restriction": c.restriction,
                },
            })
    return {
        "tasks": tasks_data,
        "count": len(tasks_data),
        "status": grabber_manager.get_status_overview(),
    }


@app.post("/api/grab/tasks")
async def add_grab_task_api(req: GrabTaskAddRequest):
    """将目标课程添加到抢课任务队列中，支持指定互斥备选组 (groupId)"""
    course = CourseItem(
        course_id=req.courseId.strip(),
        seq_no=req.seqNo.strip(),
        name=req.name.strip(),
        teacher=req.teacher.strip() if req.teacher else "",
        seats_free=req.seatsFree or 0,
        capacity=req.capacity or 0,
        classroom=req.classroom or "",
        plan_id=req.planId or "",
        schedule=req.schedule or "",
        credit=req.credit or 0.0,
        campus=req.campus or "",
        course_category=req.courseCategory or "",
        restriction=req.restriction or "",
        raw=req.raw or {},
    )
    task = grabber_manager.add_task(course, group_id=req.groupId or 0)
    return {
        "success": True,
        "message": f"成功将《{course.name}》({course.display_id}) 添加至抢课队列",
        "task": {
            "kcId": task.kc_id,
            "status": task.status.value,
            "groupId": task.group_id,
        },
    }


@app.delete("/api/grab/tasks/{kc_id}")
async def delete_grab_task_api(kc_id: str):
    """从抢课队列中移除指定课程任务"""
    ok = grabber_manager.remove_task(kc_id)
    if not ok:
        raise HTTPException(status_code=404, detail="未找到该抢课任务")
    return {"success": True, "message": f"任务 {kc_id} 已成功移除"}


@app.post("/api/grab/tasks/clear")
async def clear_grab_tasks_api(payload: GrabTasksClearRequest = Body(default=GrabTasksClearRequest())):
    """清空抢课队列（支持只清空已完成/终态任务）"""
    grabber_manager.clear_tasks(only_finished=payload.onlyFinished)
    return {"success": True, "message": "队列已清空"}


@app.put("/api/grab/tasks/reorder")
async def reorder_grab_tasks_api(req: GrabTasksReorderRequest):
    """批量调整抢课队列任务优先级顺序"""
    grabber_manager.reorder_tasks(req.orderedKcIds)
    return {"success": True, "message": "任务优先级顺序已更新"}


@app.post("/api/grab/start")
async def start_grab_api():
    """启动后台抢课守护线程"""
    ensure_authenticated()
    ok, msg = grabber_manager.start_engine(client)
    if not ok:
        raise HTTPException(status_code=400, detail=msg)
    return {
        "success": True,
        "message": msg,
        "status": grabber_manager.get_status_overview(),
    }


@app.post("/api/grab/stop")
async def stop_grab_api():
    """停止后台抢课守护线程"""
    ok, msg = grabber_manager.stop_engine()
    if not ok:
        raise HTTPException(status_code=400, detail=msg)
    return {
        "success": True,
        "message": msg,
        "status": grabber_manager.get_status_overview(),
    }


@app.get("/api/grab/status")
async def get_grab_status_api():
    """获取当前抢课运行状态（时长、尝试次数、成功率、各状态任务统计等）"""
    return grabber_manager.get_status_overview()


@app.get("/api/grab/logs")
async def get_grab_logs_api(since_id: int = Query(default=0, description="增量日志序列号游标")):
    """增量拉取最新的抢课控制台日志"""
    logs = grabber_manager.get_logs(since_id=since_id)
    return {
        "logs": logs,
        "count": len(logs),
        "latestId": logs[-1]["id"] if logs else since_id,
        "isRunning": grabber_manager.is_running,
    }


@app.get("/api/grab/config")
async def get_grab_config_api():
    """获取抢课配置参数"""
    return {
        "sleepTime": grabber_manager.config.sleep_time,
        "sleepJitter": grabber_manager.config.sleep_jitter,
        "maxFailures": grabber_manager.config.max_failures,
        "phase": grabber_manager.config.phase,
        "majorId": grabber_manager.config.major_id,
    }


@app.post("/api/grab/config")
async def update_grab_config_api(req: GrabConfigUpdateRequest):
    """更新抢课配置参数（休眠秒数、抖动、选课阶段、专业号等）"""
    cfg = grabber_manager.config
    if req.sleepTime is not None:
        cfg.sleep_time = max(0.2, float(req.sleepTime))
    if req.sleepJitter is not None:
        cfg.sleep_jitter = max(0.0, float(req.sleepJitter))
    if req.maxFailures is not None:
        cfg.max_failures = max(1, int(req.maxFailures))
    if req.phase is not None:
        if req.phase in PHASE_META:
            cfg.phase = req.phase
    if req.majorId is not None:
        cfg.major_id = req.majorId.strip()

    grabber_manager.save_config()
    return {
        "success": True,
        "message": "抢课配置参数已保存",
        "config": {
            "sleepTime": cfg.sleep_time,
            "sleepJitter": cfg.sleep_jitter,
            "maxFailures": cfg.max_failures,
            "phase": cfg.phase,
            "majorId": cfg.major_id,
            "scheduledTime": cfg.scheduled_time,
        },
    }


@app.get("/api/grab/logs/stream")
async def stream_grab_logs_api(request: Request):
    """
    通过 SSE (Server-Sent Events) 实时推送抢课终端日志流
    支持心跳保持、连接自动回收与历史最近日志无缝回放
    """
    async def event_generator():
        loop = asyncio.get_running_loop()
        q = asyncio.Queue(maxsize=200)
        grabber_manager.subscribe_logs(q, loop)
        try:
            # 1. 建立长连接时，优先下发最近 25 条历史日志，让前端控制台瞬间就绪
            recent = grabber_manager.get_logs(since_id=max(0, grabber_manager._log_counter - 25))
            for item in recent:
                yield f"data: {json.dumps(item, ensure_ascii=False)}\n\n"

            # 2. 持续等待新日志，带 15 秒心跳包保持长连接活性
            while True:
                if await request.is_disconnected():
                    break
                try:
                    item = await asyncio.wait_for(q.get(), timeout=15.0)
                    yield f"data: {json.dumps(item, ensure_ascii=False)}\n\n"
                except asyncio.TimeoutError:
                    yield ": ping\n\n"
        finally:
            grabber_manager.unsubscribe_logs(q)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.get("/api/grab/scheduled")
async def get_grab_scheduled_api():
    """获取当前毫秒级定时开抢任务状态、目标时间与剩余倒计时"""
    return grabber_manager.get_scheduled_status()


@app.post("/api/grab/scheduled")
async def set_grab_scheduled_api(req: GrabScheduledRequest):
    """设置毫秒级定时开抢时间并启动后台待命与开抢前 30s 自动预热机制"""
    ensure_authenticated()
    ok, msg, data = grabber_manager.set_scheduled_time(req.scheduledTime, client)
    if not ok:
        raise HTTPException(status_code=400, detail=msg)
    return {
        "success": True,
        "message": msg,
        "scheduled": data,
    }


@app.delete("/api/grab/scheduled")
async def cancel_grab_scheduled_api():
    """取消定时开抢计划"""
    ok, msg = grabber_manager.cancel_scheduled()
    return {
        "success": True,
        "message": msg,
        "scheduled": grabber_manager.get_scheduled_status(),
    }


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=48080)
