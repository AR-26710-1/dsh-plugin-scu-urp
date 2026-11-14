"""
DeepSeek Harness - 四川大学教务系统 (URP) 本地适配器服务
运行于本地 127.0.0.1:48080，桥接 DeepSeek Harness 插件与教务处
"""
import asyncio
import os
import json
from contextlib import asynccontextmanager
import uvicorn
from fastapi import FastAPI, HTTPException, Body, Response, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List, Dict, Any

from crypto_store import CredentialStore
from urp_client import SCUUrpClient
from calendar_exporter import generate_ics

cred_store = CredentialStore()
client = SCUUrpClient()

# 启动时自动检查是否有持久化的本地凭据
initial_creds = cred_store.load_credentials()
if initial_creds:
    client.update_credentials(initial_creds.get("username", ""), initial_creds.get("password", ""))


async def _heartbeat_loop():
    """后台轻量心跳探针，每 10 分钟检测并保活教务处 Session"""
    while True:
        try:
            await asyncio.sleep(600)
            creds = cred_store.load_credentials()
            if creds and creds.get("username"):
                client.keep_alive()
        except asyncio.CancelledError:
            break
        except Exception:
            pass


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 启动后台保活循环
    task = asyncio.create_task(_heartbeat_loop())
    yield
    task.cancel()


app = FastAPI(title="SCU URP Harness Bridge", version="1.0.0", lifespan=lifespan)


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

        # 生成 CSV，带 \ufeff (UTF-8 BOM)，确保 Windows Excel 打开不乱码
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


if __name__ == "__main__":
    uvicorn.run("app:app", host="127.0.0.1", port=48080, reload=False)
