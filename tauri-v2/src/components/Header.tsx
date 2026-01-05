import React, { useState, useEffect } from 'react';
import { Minus, X, Square, Copy } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';

interface HeaderProps {
    cpuModel?: string;
}

export default function Header({ cpuModel }: HeaderProps) {
    const [isMaximized, setIsMaximized] = useState(false);
    const appWindow = getCurrentWindow();

    useEffect(() => {
        let unlisten: (() => void) | undefined;

        const setupListener = async () => {
            unlisten = await appWindow.onResized(async () => {
                const maximized = await appWindow.isMaximized();
                setIsMaximized(maximized);
            });
        };

        setupListener();
        return () => {
            if (unlisten) unlisten();
        };
    }, []);

    const handleMinimize = () => invoke('window_minimize');
    const handleToggleMaximize = () => invoke('window_toggle_maximize');
    const handleClose = () => invoke('window_close');

    return (
        <div className="flex items-center justify-between pl-6 pr-0 py-0 drag bg-white/50 backdrop-blur-md border-b border-slate-200/50 h-14">
            <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-pink-500 flex items-center justify-center shadow-glow">
                    <span className="text-white font-bold text-xs tracking-tight">TN</span>
                </div>
                <div>
                    <h1 className="text-lg font-bold bg-gradient-to-r from-violet-600 to-pink-600 bg-clip-text text-transparent">Task Nexus</h1>
                    <p className="text-xs text-slate-400">任务调度器</p>
                </div>
            </div>

            <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2 no-drag opacity-80 hover:opacity-100 transition-opacity">
                <span className="text-sm font-medium bg-gradient-to-r from-violet-600/80 to-pink-600/80 bg-clip-text text-transparent">
                    反馈及获取更新群聊：629474892
                </span>
            </div>

            <div className="flex items-center no-drag h-full">
                <button
                    onClick={handleMinimize}
                    className="w-12 h-full text-slate-400 hover:text-slate-600 hover:bg-slate-100/80 transition-all flex items-center justify-center"
                >
                    <Minus size={16} />
                </button>
                <button
                    onClick={handleToggleMaximize}
                    className="w-12 h-full text-slate-400 hover:text-slate-600 hover:bg-slate-100/80 transition-all flex items-center justify-center"
                >
                    {isMaximized ? <Copy size={14} /> : <Square size={14} />}
                </button>
                <button
                    onClick={handleClose}
                    className="w-12 h-full text-slate-400 hover:text-white hover:bg-red-500 transition-all flex items-center justify-center"
                >
                    <X size={18} />
                </button>
            </div>
        </div>
    );
}
