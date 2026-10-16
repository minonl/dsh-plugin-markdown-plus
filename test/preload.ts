/** 测试预加载：注册最小 DOM 环境（happy-dom），供引擎/模块的 DOM 级测试使用。 */
import { GlobalRegistrator } from '@happy-dom/global-registrator';

GlobalRegistrator.register();
