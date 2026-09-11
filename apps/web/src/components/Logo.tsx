interface LogoProps {
  /** Logo 高度(px)，方形图标的宽度与高度相同 */
  size?: number;
  /** wordmark 用于桌面横版，mark 用于移动端与紧凑区域 */
  variant?: 'wordmark' | 'mark';
  className?: string;
}

const WORDMARK_ASPECT_RATIO = 1061 / 310;

export function Logo({ size = 32, variant = 'mark', className }: LogoProps) {
  const isWordmark = variant === 'wordmark';

  return (
    <img
      src={isWordmark ? '/brand/hitframe-logo.png' : '/brand/hitframe-icon.png'}
      alt="HitFrame"
      width={isWordmark ? Math.round(size * WORDMARK_ASPECT_RATIO) : size}
      height={size}
      className={className}
      style={{ height: size, width: isWordmark ? 'auto' : size, objectFit: 'contain' }}
      draggable={false}
    />
  );
}
