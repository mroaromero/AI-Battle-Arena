import React, { useState } from 'react';
import { useLogin } from '@refinedev/core';

export const Login: React.FC = () => {
  const [secret, setSecret] = useState('');
  const { mutate: login } = useLogin();

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    login({ secret });
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 relative">
      <div className="w-full max-w-lg stagger-enter">
        <div className="font-mono text-[0.65rem] text-textMuted tracking-[0.2em] mb-6 bg-alpha-dim border border-alpha/30 inline-flex items-center gap-3 px-4 py-1.5 uppercase">
          <div className="w-2 h-2 bg-alpha animate-[pulse-neon_1s_infinite_alternate] shadow-[0_0_10px_var(--alpha-neon)]"></div>
          // ACCESO RESTRINGIDO - MODO ADMINISTRADOR //
        </div>
        
        <h1 className="font-display text-4xl sm:text-5xl font-bold uppercase tracking-tighter mb-8 glitch-text cursor-default">
          BATTLE_<span className="text-alpha">ADMIN</span>
        </h1>

        <div className="bg-surface border border-borderBright p-8 relative">
          <form onSubmit={onSubmit} className="space-y-8 relative z-10">
            <div className="space-y-4">
              <label htmlFor="secret" className="block font-mono text-sm font-bold text-text uppercase tracking-widest cursor-text">
                {'>'} INSERTE TOKEN MAESTRO
              </label>
              <input 
                id="secret"
                type="password" 
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                placeholder="••••••••••••"
                className="w-full bg-bg border border-borderBright px-4 py-3 text-lg font-mono text-text outline-none focus:border-alpha focus:bg-alpha-dim transition-colors placeholder:text-[rgba(255,255,255,0.25)]"
                required
              />
            </div>
            
            <button 
              type="submit" 
              className="w-full bg-alpha font-mono text-bg font-extrabold text-[0.8rem] tracking-[0.2em] uppercase py-4 outline-none border border-transparent shadow-[0_0_20px_var(--alpha-dim)] hover:bg-white hover:text-black hover:shadow-[0_0_30px_rgba(255,255,255,0.5)] active:translate-y-px transition-all disabled:opacity-50 disabled:pointer-events-none"
            >
              {'[ INICIAR_ACCESO ]'}
            </button>
          </form>
          
          <div className="absolute bottom-[-1px] right-[-1px] w-4 h-4 border-r-2 border-b-2 border-alpha pointer-events-none"></div>
          <div className="absolute top-[-1px] left-[-1px] w-4 h-4 border-l-2 border-t-2 border-alpha pointer-events-none"></div>
        </div>
      </div>
    </div>
  );
};
