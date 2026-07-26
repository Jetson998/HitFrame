import { Sparkles, Shirt, Megaphone, MessageSquare } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useAppStore } from '@/store';

/**
 * 帮助面板：三条模板流程的核心步骤速览（内容对齐 docs/快速上手.md，
 * 精简为产品内直读文案，不做 markdown 渲染）。
 */
const FLOWS = [
  {
    icon: Sparkles,
    title: '商品换背景',
    scene: '电商主图批量出不同背景版本',
    steps: ['上传商品图', '选背景风格与光影', '设置比例/清晰度/数量', '生成，自动存入资产库'],
  },
  {
    icon: Shirt,
    title: '模特上身 / 真人试穿',
    scene: '服装/配饰图变真人上身效果',
    steps: [
      '上传服装/商品图',
      '（可选）上传模特参考图',
      '选人物风格、姿态、场景',
      '生成，自动存入资产库',
    ],
  },
  {
    icon: Megaphone,
    title: '电商海报 / 小红书封面',
    scene: '商品图 + 文案快速出营销海报',
    steps: ['上传商品图', '填标题与核心卖点', '选设计风格（建议竖版比例）', '生成，自动存入资产库'],
  },
];

export function HelpDialog() {
  const { helpOpen, setHelpOpen, setNav, setGenMode, setActiveTplId } = useAppStore();

  const goTemplate = () => {
    setGenMode('template');
    setActiveTplId(null);
    setNav('generate');
    setHelpOpen(false);
  };

  const goAgent = () => {
    setNav('agent');
    setHelpOpen(false);
  };

  return (
    <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
      <DialogContent className="max-w-[640px]">
        <div className="p-6">
          <DialogTitle className="text-[18px] font-bold text-ink">快速上手</DialogTitle>
          <DialogDescription className="mt-1 text-[13px] text-dim">
            三条典型流程，操作路径一致：上传/选择图片 → 填场景选项 → 设置输出 → 生成 → 存入资产库。
          </DialogDescription>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {FLOWS.map((flow) => {
              const Icon = flow.icon;
              return (
                <div
                  key={flow.title}
                  className="flex flex-col rounded-[--radius-card] border border-line bg-panel-muted p-3.5"
                >
                  <div className="mb-2 flex items-center gap-2">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-[9px] bg-primary-soft text-primary">
                      <Icon size={15} />
                    </span>
                    <span className="text-[13.5px] font-semibold text-ink">{flow.title}</span>
                  </div>
                  <p className="mb-2.5 text-[11.5px] leading-relaxed text-faint">{flow.scene}</p>
                  <ol className="space-y-1 text-[12px] leading-relaxed text-dim">
                    {flow.steps.map((s, i) => (
                      <li key={i} className="flex gap-1.5">
                        <span className="shrink-0 text-faint">{i + 1}.</span>
                        <span>{s}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              );
            })}
          </div>

          <div className="mt-4 flex items-start gap-2 rounded-[--radius-card] border border-line-soft bg-panel-muted px-3.5 py-3 text-[12px] leading-relaxed text-dim">
            <MessageSquare size={15} className="mt-0.5 shrink-0 text-primary" />
            <span>
              不想逐项选选项？也可以在 Agent 页用一句话描述需求（例如"商品换大理石背景，1张，1:1"），
              Agent 会自动解析模板与参数，<b className="text-ink">你确认后才会真正生成</b>，不会因为描述自动扣点。
            </span>
          </div>

          <div className="mt-4 flex flex-wrap gap-2 text-[12px]">
            <button
              type="button"
              onClick={goTemplate}
              className="rounded-[--radius-button] border border-primary/30 bg-primary-soft px-3 py-1.5 font-medium text-primary transition-colors hover:bg-primary/15"
            >
              去场景模板试试
            </button>
            <button
              type="button"
              onClick={goAgent}
              className="rounded-[--radius-button] border border-line px-3 py-1.5 font-medium text-dim transition-colors hover:border-primary hover:text-primary"
            >
              去 Agent 描述需求
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
