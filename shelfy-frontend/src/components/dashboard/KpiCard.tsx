import React from 'react';
import { motion } from 'framer-motion';

interface KpiCardProps {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
}

export function KpiCard({ label, value, icon, color, bgColor }: KpiCardProps) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -5, transition: { duration: 0.2 } }}
      className={`p-5 rounded-[2rem] border border-slate-200/60 shadow-sm flex flex-col justify-between overflow-hidden relative group ${bgColor}`}
    >
      {/* Decorative background circle */}
      <div 
        className="absolute -right-4 -top-4 w-24 h-24 rounded-full opacity-[0.03] group-hover:scale-150 transition-transform duration-700"
        style={{ backgroundColor: color }}
      />
      
      <div className="flex items-start justify-between relative z-10">
        <div 
          className="p-2.5 rounded-2xl mb-2 text-white shadow-lg ring-4 ring-white/10"
          style={{ backgroundColor: color }}
        >
          {icon}
        </div>
        <div className="text-3xl font-black tracking-tighter" style={{ color }}>
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1 }}
          >
            {value}
          </motion.span>
        </div>
      </div>
      
      <div className="mt-3 relative z-10">
        <div className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 group-hover:text-slate-500 transition-colors">
          {label}
        </div>
        <div className="h-1 w-8 rounded-full mt-1.5 opacity-30 group-hover:w-12 transition-all duration-300" style={{ backgroundColor: color }} />
      </div>
    </motion.div>
  );
}
