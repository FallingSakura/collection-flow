import type { ReactNode } from 'react';

interface Props {
  label: string;
  children: ReactNode;
}

export default function Tooltip({ label, children }: Props) {
  return (
    <div className="relative group inline-flex">
      {children}
      <div
        className="
          pointer-events-none
          absolute left-1/2 top-full mt-2 -translate-x-1/2
          whitespace-nowrap
          rounded-lg px-2.5 py-1.5 text-xs
          bg-black/70 backdrop-blur-md text-white
          opacity-0 scale-95
          transition-all duration-150
          group-hover:opacity-100 group-hover:scale-100
        "
      >
        {label}
      </div>
    </div>
  );
}
