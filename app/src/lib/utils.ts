import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export const cn = (...classes: ClassValue[]) => twMerge(clsx(classes));

export type WithElementRef<T, U extends HTMLElement = HTMLElement> = T & { ref?: U | null };
