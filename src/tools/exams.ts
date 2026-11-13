/**
 * 考试日程查询工具 (供 DeepSeek 模型在对话中调用)
 */
export const examsTool = {
  name: 'scu_get_exams',
  description: '查询四川大学当前排定的期末或阶段性考试安排、考试时间、考场及座位号',
  parameters: {
    type: 'object',
    properties: {},
  },
  execute: async () => {
    try {
      const resp = await fetch('http://127.0.0.1:48080/api/exams');
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ detail: '无法连接本地教务服务' }));
        return { error: err.detail || '获取考试日程失败' };
      }
      return await resp.json();
    } catch (e: any) {
      return { error: `请求本地教务服务异常: ${e.message}` };
    }
  },
};
