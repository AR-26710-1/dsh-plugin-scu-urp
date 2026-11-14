"""
DeepSeek Harness - 四川大学教务系统 (URP) 本地适配器服务
运行于本地 127.0.0.1:48080，桥接 DeepSeek Harness 插件与教务处
"""
import uvicorn
from fastapi import FastAPI, HTTPException, Body, Response, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional

from crypto_store import CredentialStore
from urp_client import SCUUrpClient
from calendar_exporter import generate_ics

app = FastAPI(title="SCU URP Harness Bridge", version="1.0.0")

# 启用 CORS 允许 Harness 客户端或 Webview 跨域访问
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

cred_store = CredentialStore()
client = SCUUrpClient()

# 启动时自动检查是否有持久化的本地凭据
initial_creds = cred_store.load_credentials()
if initial_creds:
    client.update_credentials(initial_creds.get("username", ""), initial_creds.get("password", ""))


class LoginRequest(BaseModel):
    username: str
    password: str
    remember: bool = True


@app.get("/api/status")
async def get_status():
    """获取当前服务与登录状态"""
    creds = cred_store.load_credentials()
    has_saved_creds = bool(creds and creds.get("username"))
    return {
        "status": "online",
        "hasCredentials": has_saved_creds,
        "username": client.username if has_saved_creds else "",
        "isLoggedIn": client.is_logged_in,
        "studentName": client.student_name,
    }


@app.post("/api/login")
async def login(req: LoginRequest):
    """手动登录或保存新凭据"""
    client.update_credentials(req.username, req.password)
    ok, msg = client.login()
    if not ok:
        raise HTTPException(status_code=400, detail=msg)

    if req.remember:
        cred_store.save_credentials(req.username, req.password, remember=True)
    else:
        cred_store.clear_credentials()

    return {
        "success": True,
        "message": "登录成功",
        "studentName": client.student_name,
    }


@app.post("/api/logout")
async def logout():
    """清除凭据与会话"""
    cred_store.clear_credentials()
    client.update_credentials("", "")
    client.is_logged_in = False
    client.student_name = ""
    client.session.cookies.clear()
    return {"success": True, "message": "已清除本地凭据与会话"}


def ensure_authenticated():
    """保活检查：若未登录则自动使用存储的凭据静默登录"""
    if client.is_logged_in:
        return
    creds = cred_store.load_credentials()
    if not creds:
        raise HTTPException(status_code=401, detail="尚未配置教务系统学号与密码，请先在面板中登录")
    client.update_credentials(creds.get("username", ""), creds.get("password", ""))
    ok, msg = client.login()
    if not ok:
        raise HTTPException(status_code=401, detail=f"自动登录教务处失败: {msg}")


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


if __name__ == "__main__":
    uvicorn.run("app:app", host="127.0.0.1", port=48080, reload=False)
