/**
 * 课表查询工具 (供 DeepSeek 模型在对话中调用)
 */
export const scheduleTool = {
  name: 'scu_get_schedule',
  description: '查询四川大学当前学期的课表数据、包含星期、节次、教室位置、授课教师及学分',
  parameters: {
    type: 'object',
    properties: {
      filterToday: {
        type: 'boolean',
        description: '是否仅获取今天的课程',
        default: false,
      },
    },
  },
  execute: async (args: { filterToday?: boolean }) => {
    try {
      const resp = await fetch('http://127.0.0.1:48080/api/schedule');
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ detail: '无法连接本地教务服务' }));
        return { error: err.detail || '获取课表失败' };
      }
      const data = await resp.json();
      if (args.filterToday) {
        const todayDay = new Date().getDay() || 7; // 周日为 7
        const todayCourses = (data.courses || []).filter((c: any) =>
          c.schedules?.some((s: any) => s.day === todayDay)
        );
        return {
          todayWeekday: todayDay,
          totalCoursesToday: todayCourses.length,
          courses: todayCourses,
        };
      }
      return data;
    } catch (e: any) {
      return { error: `请求本地教务服务异常: ${e.message}` };
    }
  },
};
