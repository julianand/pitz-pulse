import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

/** SVG propios (trazo 1.6 uniforme). Evitamos librerías de iconos genéricas. */
function Icon({ size = 16, children, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export const ArrowLeft = (p: IconProps) => (
  <Icon {...p}>
    <path d="M19 12H5" />
    <path d="m12 19-7-7 7-7" />
  </Icon>
);

export const ArrowRight = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 12h14" />
    <path d="m12 5 7 7-7 7" />
  </Icon>
);

export const Plus = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 5v14" />
    <path d="M5 12h14" />
  </Icon>
);

export const Check = (p: IconProps) => (
  <Icon {...p}>
    <path d="m20 6-11 11-5-5" />
  </Icon>
);

export const Alert = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 9v5" />
    <path d="M12 17h.01" />
    <path d="M10.3 3.9 1.9 18a2 2 0 0 0 1.7 3h16.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
  </Icon>
);

export const Clock = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Icon>
);

export const Sliders = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 6h10" />
    <path d="M18 6h2" />
    <path d="M4 12h4" />
    <path d="M12 12h8" />
    <path d="M4 18h12" />
    <path d="M20 18h0" />
    <circle cx="16" cy="6" r="2" />
    <circle cx="10" cy="12" r="2" />
    <circle cx="18" cy="18" r="2" />
  </Icon>
);

export const ChevronLeft = (p: IconProps) => (
  <Icon {...p}>
    <path d="m15 18-6-6 6-6" />
  </Icon>
);

export const ChevronRight = (p: IconProps) => (
  <Icon {...p}>
    <path d="m9 18 6-6-6-6" />
  </Icon>
);

export const Doc = (p: IconProps) => (
  <Icon {...p}>
    <path d="M14 3v5h5" />
    <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2Z" />
  </Icon>
);

export const Pencil = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </Icon>
);
