interface FirefliesIconProps {
  size?: "sm" | "md" | "lg";
}

const sizeMap = {
  sm: { container: "w-6 h-6 rounded", icon: "w-3.5 h-3.5" },
  md: { container: "w-8 h-8 rounded-md", icon: "w-5 h-5" },
  lg: { container: "w-12 h-12 rounded-lg", icon: "w-7 h-7" },
};

/**
 * Fireflies.ai brand icon — official geometric mark from brandfetch.
 * Four blocks: top-left square, top-right (rounded TR corner), bottom-left tall (rounded BL),
 * bottom-right square. Pink → purple → blue diagonal gradient.
 */
export const FirefliesIcon = ({ size = "lg" }: FirefliesIconProps) => (
  <div className={`${sizeMap[size].container} bg-[#1A1A1A] flex items-center justify-center`}>
    <svg viewBox="0 0 56 56" className={sizeMap[size].icon} xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="ff-icon-grad" x1="1" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#E82A73" />
          <stop offset="30%" stopColor="#C5388F" />
          <stop offset="54%" stopColor="#9B4AB0" />
          <stop offset="82%" stopColor="#6262DE" />
          <stop offset="100%" stopColor="#3B73FF" />
        </linearGradient>
      </defs>
      {/* Top-left square */}
      <path d="M18.4,0H0v18.3h18.4V0z" fill="url(#ff-icon-grad)" />
      {/* Top-right block with rounded TR corner */}
      <path
        d="M40.2,0H21.8v18.3H56v-2.6c0-4.2-1.7-8.1-4.6-11.1C48.4,1.7,44.4,0,40.2,0z"
        fill="url(#ff-icon-grad)"
      />
      {/* Bottom-left tall block with rounded BL corner */}
      <path
        d="M0,22.1v18.3c0,4.2,1.7,8.1,4.6,11.1c3,2.9,7,4.6,11.2,4.6h2.6V22.1H0z"
        fill="url(#ff-icon-grad)"
      />
      {/* Bottom-right square */}
      <path d="M40.2,22.1H21.8v18.3h18.4V22.1z" fill="url(#ff-icon-grad)" />
    </svg>
  </div>
);
