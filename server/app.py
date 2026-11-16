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
from contextlib import asynccontextmanager
import uvicorn
from fastapi import FastAPI, HTTPException, Body, Response, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List, Dict, Any

from crypto_store import CredentialStore
from urp_client import SCUUrpClient
from ele_client import ele_client
from auth_hub import auth_hub
from calendar_exporter import generate_ics

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
        }
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

        # 2. 激活电费系统会话
        ok_ele, msg_ele, e_data = auth_hub.activate_electricity_session(access_token)
        if ok_ele:
            ele_client.update_session(e_data["session"], e_data["cusNo"], e_data["cusName"])

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
            
            # 3. 自动并行激活电费系统会话
            ok_ele, msg_ele, e_data = auth_hub.activate_electricity_session(access_token)
            if ok_ele:
                ele_client.update_session(e_data["session"], e_data.get("cusNo") or username, e_data.get("cusName", ""))

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


def ensure_electricity_authenticated():
    """确保电费系统会话已就绪，若未就绪自动使用统一凭据静默激活"""
    if ele_client.is_logged_in and ele_client.cus_no:
        return
    creds = cred_store.load_credentials()
    if not creds:
        raise HTTPException(status_code=401, detail="尚未完成统一身份认证，无法查询宿舍电费")

    auth_type = creds.get("authType", "unified_sso")

    # 优先恢复已保存的电费 cookies
    if creds.get("eleCookies") and creds.get("cusNo"):
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
                return
            raise HTTPException(status_code=500, detail=f"激活电费会话失败: {msg_ele}")
        except Exception as e:
            raise HTTPException(status_code=401, detail=f"统一认证登录电费系统失败: {str(e)}")

    raise HTTPException(status_code=401, detail="电费会话未就绪，请在设置中通过统一身份认证登录")


# ================== 宿舍电费查询业务 API ==================

@app.get("/api/electricity/status")
async def get_electricity_status_api():
    """获取当前宿舍的空调电费与照明电费数据 (自动利用统一认证凭据免二次登录)"""
    ensure_electricity_authenticated()
    data = ele_client.query_electricity()
    if not data.get("success"):
        raise HTTPException(status_code=500, detail=data.get("message") or "获取电费信息失败")
    return data


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


if __name__ == "__main__":
    uvicorn.run("app:app", host="127.0.0.1", port=48080, reload=False)
