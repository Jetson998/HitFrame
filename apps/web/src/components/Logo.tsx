/**
 * HitFrame 字母徽标（参考 ModLudus 方案）
 * - 黑色圆形徽标 + 字母 H（四条独立 SVG 笔画）
 * - animated=true：逐笔描边动画，刷新播放一次，完成后保持完整
 * - 系统「减少动态效果」时自动降级为静态完整 Logo
 */
interface LogoProps {
  /** 徽标边长(px)，默认 38 */
  size?: number;
  /** 是否播放逐笔描边动画（仅首页大 logo 用） */
  animated?: boolean;
  className?: string;
}

// H 四笔：左竖(渐变) / 横梁(实白+尖尾) / 右竖上半(渐变) / 右竖下半(灰白)
const STROKE = 2.4;
// 笔画几何（viewBox 40x40）
const LX = 13.5; // 左竖 x
const RX = 26.5; // 右竖 x
const TOP = 11.5;
const BOT = 28.5;
const MID = 20;

export function Logo({ size = 38, animated = false, className }: LogoProps) {
  const anim = animated ? 'hf-logo-animated' : '';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="HitFrame"
    >
      <defs>
        {/* 圆形底色渐变 #202024 → #050506 */}
        <radialGradient id="hf-bg" cx="35%" cy="28%" r="85%">
          <stop offset="0%" stopColor="#202024" />
          <stop offset="100%" stopColor="#050506" />
        </radialGradient>
        {/* 第一笔（左竖）渐变：起点42% → 末端100%。垂直线 bbox 宽为0，必须用 userSpaceOnUse */}
        <linearGradient id="hf-s1" gradientUnits="userSpaceOnUse" x1={LX} y1={TOP} x2={LX} y2={BOT}>
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.42" />
          <stop offset="5%" stopColor="#ffffff" stopOpacity="0.48" />
          <stop offset="55%" stopColor="#ffffff" stopOpacity="0.7" />
          <stop offset="80%" stopColor="#ffffff" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="1" />
        </linearGradient>
        {/* 第二笔（横梁）横向渐变：前10%不可见，前35%由虚变实 */}
        <linearGradient id="hf-s2" gradientUnits="userSpaceOnUse" x1={LX} y1={MID} x2={RX} y2={MID}>
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="10%" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="35%" stopColor="#ffffff" stopOpacity="1" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="1" />
        </linearGradient>
        {/* 第三笔（右竖）渐变：顶部略淡 → 底部实 */}
        <linearGradient id="hf-s3" gradientUnits="userSpaceOnUse" x1={RX} y1={TOP} x2={RX} y2={BOT}>
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="60%" stopColor="#ffffff" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="1" />
        </linearGradient>
        <filter id="hf-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="0.35" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* 圆形徽标 + 立体阴影 + 紫色环境光 */}
      <circle cx="20" cy="20" r="19" fill="url(#hf-bg)" />
      <circle cx="20" cy="20" r="18.6" fill="none" stroke="#6d5bff" strokeOpacity="0.12" strokeWidth="0.8" />

      <g strokeWidth={STROKE} strokeLinejoin="miter" filter="url(#hf-glow)" className={anim}>
        {/* 第一笔：左竖（渐变），方形端点 */}
        <line
          className="hf-p1"
          pathLength={100}
          strokeLinecap="square"
          x1={LX}
          y1={TOP}
          x2={LX}
          y2={BOT}
          stroke="url(#hf-s1)"
        />
        {/* 第二笔：横梁（横向渐变），平端点不越过左右竖线 */}
        <line
          className="hf-p2"
          pathLength={100}
          strokeLinecap="butt"
          x1={LX}
          y1={MID}
          x2={RX}
          y2={MID}
          stroke="url(#hf-s2)"
        />
        {/* 第三笔：右竖（渐变），方形端点 */}
        <line
          className="hf-p3"
          pathLength={100}
          strokeLinecap="square"
          x1={RX}
          y1={TOP}
          x2={RX}
          y2={BOT}
          stroke="url(#hf-s3)"
        />
      </g>
    </svg>
  );
}
