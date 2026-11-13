import { Context } from 'cordis';
import { scheduleTool } from './tools/schedule.js';
import { gradesTool } from './tools/grades.js';
import { examsTool } from './tools/exams.js';
import { ScuDrawer } from './views/ScuDrawer.js';

export const name = 'dsh-plugin-scu-urp';

export interface Config {
  servicePort?: number;
}

export const Config = {
  // Cordis 插件配置 Schema
};

/**
 * DeepSeek Harness 插件入口函数
 */
export function apply(ctx: Context, config: Config = {}) {
  // 1. 注册 DeepSeek Harness 左侧边栏 Slot 入口
  if ((ctx as any).sidebar) {
    (ctx as any).sidebar.register({
      id: 'scu-urp',
      title: '川大教务处',
      icon: 'graduation-cap',
      position: 'top',
      component: ScuDrawer,
    });
  }

  // 2. 注册 DeepSeek 模型可直接调用的 Agent 对话工具
  if ((ctx as any).tools) {
    (ctx as any).tools.register(scheduleTool.name, {
      description: scheduleTool.description,
      parameters: scheduleTool.parameters,
      execute: scheduleTool.execute,
    });

    (ctx as any).tools.register(gradesTool.name, {
      description: gradesTool.description,
      parameters: gradesTool.parameters,
      execute: gradesTool.execute,
    });

    (ctx as any).tools.register(examsTool.name, {
      description: examsTool.description,
      parameters: examsTool.parameters,
      execute: examsTool.execute,
    });
  }
}

export { ScuDrawer, scheduleTool, gradesTool, examsTool };
