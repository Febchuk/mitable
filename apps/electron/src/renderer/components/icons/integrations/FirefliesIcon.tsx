interface FirefliesIconProps {
  size?: "sm" | "md" | "lg";
}

const sizeMap = {
  sm: { container: "w-6 h-6 rounded", icon: "w-3.5 h-3.5" },
  md: { container: "w-8 h-8 rounded-md", icon: "w-5 h-5" },
  lg: { container: "w-12 h-12 rounded-lg", icon: "w-7 h-7" },
};

export const FirefliesIcon = ({ size = "lg" }: FirefliesIconProps) => (
  <div className={`${sizeMap[size].container} bg-[#1A1A1A] flex items-center justify-center`}>
    <svg
      viewBox="0 0 512 512"
      className={sizeMap[size].icon}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="ff-grad-tl" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#9B59B6" />
          <stop offset="100%" stopColor="#C850A0" />
        </linearGradient>
        <linearGradient id="ff-grad-tr" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#C850A0" />
          <stop offset="100%" stopColor="#E84393" />
        </linearGradient>
        <linearGradient id="ff-grad-bl" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#B84DAF" />
          <stop offset="100%" stopColor="#E84393" />
        </linearGradient>
        <linearGradient id="ff-grad-br" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#E84393" />
          <stop offset="100%" stopColor="#FF2D78" />
        </linearGradient>
      </defs>
      {/* Top-left: rounded square (top-left corner rounded) */}
      <path
        d="M80 56 h120 v130 h-130 v-120 a10,10 0 0 1 10,-10z"
        fill="url(#ff-grad-tl)"
      />
      {/* Top-right: quarter circle (top-right rounded) */}
      <path
        d="M212 56 h120 a130,130 0 0 1 0,130 h-120 z"
        fill="url(#ff-grad-tr)"
      />
      {/* Bottom-left: vertical half-pill (left side rounded) */}
      <path
        d="M80 198 h90 v180 h-90 a90,90 0 0 1 0,-180z"
        fill="url(#ff-grad-bl)"
      />
      {/* Bottom-right: square */}
      <path
        d="M212 198 h130 v130 h-130 z"
        fill="url(#ff-grad-br)"
      />
    </svg>
  </div>
);
