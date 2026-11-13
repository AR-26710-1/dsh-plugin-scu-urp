/**
 * 成绩查询与 GPA 统计工具 (供 DeepSeek 模型在对话中调用)
 */
export const gradesTool = {
  name: 'scu_get_grades',
  description: '查询四川大学全部学期或指定学期的成绩列表、总学分、平均学分绩点(GPA)与加权平均分',
  parameters: {
    type: 'object',
    properties: {
      term: {
        type: 'string',
        description: '可选：指定学期代码（例如 "2024-2025-1-1"），不传则返回全量成绩与总GPA',
      },
    },
  },
  execute: async (args: { term?: string }) => {
    try {
      const resp = await fetch('http://127.0.0.1:48080/api/grades');
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ detail: '无法连接本地教务服务' }));
        return { error: err.detail || '获取成绩失败' };
      }
      const data = await resp.json();
      if (args.term) {
        const filtered = (data.grades || []).filter((g: any) => g.term === args.term);
        return {
          term: args.term,
          totalCourses: filtered.length,
          grades: filtered,
        };
      }
      return data;
    } catch (e: any) {
      return { error: `请求本地教务服务异常: ${e.message}` };
    }
  },
};
