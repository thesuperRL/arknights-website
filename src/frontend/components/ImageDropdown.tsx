import React, { useRef, useEffect, useState } from 'react';
import { getImageUrl } from '../api';
import './ImageDropdown.css';

export interface ImageDropdownOption {
  id: string;
  label: string;
  image?: string | null;
}

interface ImageDropdownProps {
  options: ImageDropdownOption[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
}

export const ImageDropdown: React.FC<ImageDropdownProps> = ({
  options,
  value,
  onChange,
  placeholder = 'Select…',
  className = '',
  ariaLabel
}) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const selected = options.find(o => o.id === value);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className={`image-dropdown ${className}`} ref={containerRef} aria-label={ariaLabel}>
      <button
        type="button"
        className="image-dropdown-trigger"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        {selected ? (
          <>
            {selected.image && (
              <img src={getImageUrl(selected.image)} alt="" className="image-dropdown-trigger-img" />
            )}
            <span className="image-dropdown-trigger-label">{selected.label}</span>
          </>
        ) : (
          <span className="image-dropdown-trigger-placeholder">{placeholder}</span>
        )}
        <span className="image-dropdown-chevron" aria-hidden>▼</span>
      </button>
      {open && (
        <div className="image-dropdown-list" role="listbox">
          {options.map((opt) => (
            <button
              key={opt.id}
              type="button"
              role="option"
              aria-selected={opt.id === value}
              className={`image-dropdown-option ${opt.id === value ? 'selected' : ''}`}
              onClick={() => {
                onChange(opt.id);
                setOpen(false);
              }}
            >
              {opt.image ? (
                <img src={getImageUrl(opt.image)} alt="" className="image-dropdown-option-img" />
              ) : (
                <span className="image-dropdown-option-no-img">{opt.label}</span>
              )}
              <span className="image-dropdown-option-label">{opt.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
