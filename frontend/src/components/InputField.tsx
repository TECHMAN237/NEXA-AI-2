import React from 'react';

interface InputFieldProps {
  label: string;
  icon?: React.ReactNode;
  error?: string;
  type?: string;
  placeholder?: string;
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  className?: string;
  required?: boolean;
}

export default function InputField({ 
  label, 
  icon, 
  error, 
  type = 'text', 
  placeholder, 
  value, 
  onChange, 
  className = '', 
  required 
}: InputFieldProps) {
  return (
    <div className="flex flex-col space-y-1.5 w-full">
      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest pl-1 font-mono">
        {label}
      </label>
      <div className="relative">
        {icon && (
          <div className="absolute left-3.5 top-1/2 transform -translate-y-1/2 text-gray-500">
            {icon}
          </div>
        )}
        <input
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          required={required}
          className={`w-full bg-[#080B10] text-xs text-white border border-nexa-border hover:border-gray-700 focus:border-nexa-blue focus:outline-none rounded-xl py-3 transition duration-200 ${
            icon ? 'pl-11' : 'px-4'
          } ${error ? 'border-red-500 focus:border-red-500' : ''} ${className}`}
        />
      </div>
      {error && (
        <span className="text-[9.5px] font-semibold text-red-400 pl-1">
          {error}
        </span>
      )}
    </div>
  );
}
