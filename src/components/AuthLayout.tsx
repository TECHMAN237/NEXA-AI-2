import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ArrowLeft, Mail, Lock, User, Check, Sparkles, Shield, AlertTriangle 
} from 'lucide-react';

import GlassCard from './GlassCard.js';
import InputField from './InputField.js';
import PrimaryButton from './PrimaryButton.js';
import SocialButton from './SocialButton.js';
import RobotHero from './RobotHero.js';

interface AuthLayoutProps {
  onSuccess: (userData: { name: string; email: string }) => void;
}

type ScreenType = 'splash' | 'login' | 'register' | 'forgot';

export default function AuthLayout({ onSuccess }: AuthLayoutProps) {
  const [currentScreen, setCurrentScreen] = useState<ScreenType>('splash');
  const [isLoading, setIsLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  
  // Registration Form States
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [regTerms, setRegTerms] = useState(false);
  const [regErrors, setRegErrors] = useState<{ [key: string]: string }>({});

  // Login Form States
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginErrors, setLoginErrors] = useState<{ [key: string]: string }>({});

  // Forgot Password States
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotError, setForgotError] = useState('');
  const [forgotSuccess, setForgotSuccess] = useState(false);

  // Helper validation
  const validateEmail = (email: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const errors: { [key: string]: string } = {};

    if (!loginEmail.trim()) {
      errors.email = 'Email address is required';
    } else if (!validateEmail(loginEmail)) {
      errors.email = 'Invalid email address format';
    }

    if (!loginPassword) {
      errors.password = 'Password is required';
    } else if (loginPassword.length < 6) {
      errors.password = 'Password must be at least 6 characters';
    }

    if (Object.keys(errors).length > 0) {
      setLoginErrors(errors);
      return;
    }

    setLoginErrors({});
    setIsLoading(true);

    // Simulate decrypted safe login
    setTimeout(() => {
      setIsLoading(false);
      setSuccessMessage('NEXA security signature decrypted. Opening secure connection...');
      setTimeout(() => {
        onSuccess({
          name: loginEmail.split('@')[0].toUpperCase(),
          email: loginEmail
        });
      }, 1500);
    }, 1800);
  };

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    const errors: { [key: string]: string } = {};

    if (!regName.trim()) {
      errors.name = 'Full name is required';
    }
    if (!regEmail.trim()) {
      errors.email = 'Email address is required';
    } else if (!validateEmail(regEmail)) {
      errors.email = 'Invalid email address format';
    }
    if (!regPassword) {
      errors.password = 'Password is required';
    } else if (regPassword.length < 6) {
      errors.password = 'Password must be at least 6 characters';
    }
    if (regPassword !== regConfirmPassword) {
      errors.confirmPassword = 'Passwords do not match';
    }
    if (!regTerms) {
      errors.terms = 'You must accept the terms of service';
    }

    if (Object.keys(errors).length > 0) {
      setRegErrors(errors);
      return;
    }

    setRegErrors({});
    setIsLoading(true);

    // Simulate registration encryption
    setTimeout(() => {
      setIsLoading(false);
      setSuccessMessage('Creating secure matrix database vault... Complete!');
      setTimeout(() => {
        onSuccess({
          name: regName,
          email: regEmail
        });
      }, 1500);
    }, 1800);
  };

  const handleForgotPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail.trim()) {
      setForgotError('Email address is required');
      return;
    } else if (!validateEmail(forgotEmail)) {
      setForgotError('Invalid email address format');
      return;
    }

    setForgotError('');
    setIsLoading(true);

    setTimeout(() => {
      setIsLoading(false);
      setForgotSuccess(true);
    }, 1500);
  };

  const handleGoogleLogin = () => {
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      setSuccessMessage('Google Account handshake authenticated. Syncing identity...');
      setTimeout(() => {
        onSuccess({
          name: 'Steeve Zali',
          email: 'steevezali@gmail.com'
        });
      }, 1500);
    }, 1200);
  };

  return (
    <div className="min-h-screen bg-[#06080C] text-white flex flex-col justify-between items-center relative py-8 px-4 overflow-y-auto custom-scrollbar select-none">
      {/* Background Neon Glow Dots */}
      <div className="absolute top-20 left-10 w-96 h-96 bg-nexa-blue/5 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-20 right-10 w-96 h-96 bg-nexa-purple/5 rounded-full blur-3xl pointer-events-none"></div>

      {/* Top Header Logo */}
      <header className="w-full max-w-md flex flex-col items-center justify-center space-y-2 mb-4 relative z-10">
        <div className="flex items-center space-x-2.5">
          <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-nexa-blue via-cyan-400 to-nexa-purple flex items-center justify-center shadow-lg shadow-cyan-400/20">
            <span className="text-white font-black text-base tracking-widest font-display">N</span>
          </div>
          <span className="text-lg font-black tracking-widest font-display bg-gradient-to-r from-white via-gray-300 to-gray-500 bg-clip-text text-transparent">NEXA AI</span>
        </div>
        <p className="text-[10px] font-mono tracking-widest text-gray-500 uppercase">Secure Intelligence Matrix</p>
      </header>

      {/* Main Authentication Card Arena */}
      <main className="w-full max-w-md my-auto relative z-10">
        <AnimatePresence mode="wait">
          
          {/* 1. SPLASH / WELCOME SCREEN */}
          {currentScreen === 'splash' && (
            <motion.div
              key="splash"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.3 }}
              className="space-y-6"
            >
              <GlassCard className="text-center space-y-6">
                <RobotHero />

                <div className="space-y-2">
                  <h2 className="text-2xl font-extrabold font-display tracking-tight text-white flex items-center justify-center space-x-2">
                    <span>NEXA Companion</span>
                    <Sparkles className="w-4 h-4 text-nexa-glow animate-pulse" />
                  </h2>
                  <p className="text-xs text-gray-400 max-w-[280px] mx-auto leading-relaxed">
                    A premium self-learning companion optimized for planning, study, and secure life tracking.
                  </p>
                </div>

                <div className="space-y-3 pt-2">
                  <PrimaryButton onClick={() => setCurrentScreen('register')}>
                    Create Vault Account
                  </PrimaryButton>
                  
                  <button
                    onClick={() => setCurrentScreen('login')}
                    className="w-full py-3 rounded-xl border border-nexa-border hover:border-gray-500 text-xs font-bold uppercase tracking-wider text-gray-300 hover:text-white transition duration-200 cursor-pointer bg-slate-900/30"
                  >
                    Authenticate Login
                  </button>
                </div>
              </GlassCard>
            </motion.div>
          )}

          {/* 2. REGISTRATION SCREEN */}
          {currentScreen === 'register' && (
            <motion.div
              key="register"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
            >
              <GlassCard className="space-y-5">
                {/* Back button and title */}
                <div className="flex items-center space-x-3 pb-2 border-b border-nexa-border/50">
                  <button 
                    onClick={() => setCurrentScreen('splash')}
                    className="p-2 rounded-lg bg-nexa-card hover:bg-nexa-border text-gray-400 hover:text-white transition cursor-pointer"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  <div>
                    <h2 className="text-sm font-extrabold font-display uppercase tracking-widest text-white">Create Vault</h2>
                    <p className="text-[10px] text-gray-400">Initialize a new secure personal identity</p>
                  </div>
                </div>

                {successMessage ? (
                  <div className="py-8 flex flex-col items-center justify-center text-center space-y-3.5">
                    <div className="w-12 h-12 rounded-full bg-nexa-blue/15 border border-nexa-glow animate-bounce flex items-center justify-center text-nexa-glow">
                      <Check className="w-6 h-6" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-nexa-glow uppercase tracking-wider font-mono">Vault Constructed</p>
                      <p className="text-[11px] text-gray-300 px-4 leading-relaxed">{successMessage}</p>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleRegister} className="space-y-4">
                    <InputField 
                      label="Full Identity Name"
                      placeholder="e.g. Steeve Zali"
                      value={regName}
                      onChange={(e) => setRegName(e.target.value)}
                      icon={<User className="w-4 h-4" />}
                      error={regErrors.name}
                    />

                    <InputField 
                      label="Security Email Router"
                      type="email"
                      placeholder="name@domain.com"
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      icon={<Mail className="w-4 h-4" />}
                      error={regErrors.email}
                    />

                    <InputField 
                      label="Secure Password passphrase"
                      type="password"
                      placeholder="••••••••"
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      icon={<Lock className="w-4 h-4" />}
                      error={regErrors.password}
                    />

                    <InputField 
                      label="Verify Passphrase"
                      type="password"
                      placeholder="••••••••"
                      value={regConfirmPassword}
                      onChange={(e) => setRegConfirmPassword(e.target.value)}
                      icon={<Lock className="w-4 h-4" />}
                      error={regErrors.confirmPassword}
                    />

                    {/* Terms checklist option */}
                    <div className="flex items-start space-x-2.5 pt-1">
                      <input 
                        type="checkbox"
                        id="regTerms"
                        checked={regTerms}
                        onChange={(e) => setRegTerms(e.target.checked)}
                        className="mt-0.5 rounded border-nexa-border bg-[#080B10] text-nexa-blue focus:ring-0 focus:ring-offset-0 cursor-pointer"
                      />
                      <label htmlFor="regTerms" className="text-[10px] text-gray-400 leading-normal cursor-pointer">
                        I authorize NEXA AI to encrypt my study schedules and planner items securely.
                      </label>
                    </div>
                    {regErrors.terms && (
                      <p className="text-[9.5px] font-semibold text-red-400 pl-1">{regErrors.terms}</p>
                    )}

                    <PrimaryButton type="submit" isLoading={isLoading} className="mt-2">
                      Initialize Vault
                    </PrimaryButton>

                    <div className="text-center pt-2">
                      <button
                        type="button"
                        onClick={() => setCurrentScreen('login')}
                        className="text-[10.5px] text-gray-400 hover:text-white transition cursor-pointer font-medium"
                      >
                        Already registered? <span className="text-nexa-glow font-bold">Authenticate Login</span>
                      </button>
                    </div>
                  </form>
                )}
              </GlassCard>
            </motion.div>
          )}

          {/* 3. LOGIN SCREEN */}
          {currentScreen === 'login' && (
            <motion.div
              key="login"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.3 }}
            >
              <GlassCard className="space-y-5">
                {/* Back button and title */}
                <div className="flex items-center space-x-3 pb-2 border-b border-nexa-border/50">
                  <button 
                    onClick={() => setCurrentScreen('splash')}
                    className="p-2 rounded-lg bg-nexa-card hover:bg-nexa-border text-gray-400 hover:text-white transition cursor-pointer"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  <div>
                    <h2 className="text-sm font-extrabold font-display uppercase tracking-widest text-white">Login Authentication</h2>
                    <p className="text-[10px] text-gray-400">Unlock your digital companion workspace</p>
                  </div>
                </div>

                {successMessage ? (
                  <div className="py-8 flex flex-col items-center justify-center text-center space-y-3.5">
                    <div className="w-12 h-12 rounded-full bg-nexa-blue/15 border border-nexa-glow animate-bounce flex items-center justify-center text-nexa-glow">
                      <Shield className="w-6 h-6" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-nexa-glow uppercase tracking-wider font-mono">Workspace Authenticated</p>
                      <p className="text-[11px] text-gray-300 px-4 leading-relaxed">{successMessage}</p>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleLogin} className="space-y-4">
                    <InputField 
                      label="Account Email"
                      type="email"
                      placeholder="name@domain.com"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      icon={<Mail className="w-4 h-4" />}
                      error={loginErrors.email}
                    />

                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center px-1">
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest font-mono">Passphrase</label>
                        <button
                          type="button"
                          onClick={() => setCurrentScreen('forgot')}
                          className="text-[10px] font-bold text-nexa-purple hover:text-purple-400 transition cursor-pointer"
                        >
                          Forgot Passphrase?
                        </button>
                      </div>
                      <div className="relative">
                        <span className="absolute left-3.5 top-1/2 transform -translate-y-1/2 text-gray-500">
                          <Lock className="w-4 h-4" />
                        </span>
                        <input
                          type="password"
                          placeholder="••••••••"
                          value={loginPassword}
                          onChange={(e) => setLoginPassword(e.target.value)}
                          className={`w-full bg-[#080B10] text-xs text-white border border-nexa-border hover:border-gray-700 focus:border-nexa-blue focus:outline-none rounded-xl py-3 pl-11 transition duration-200 ${
                            loginErrors.password ? 'border-red-500' : ''
                          }`}
                        />
                      </div>
                      {loginErrors.password && (
                        <p className="text-[9.5px] font-semibold text-red-400 pl-1">{loginErrors.password}</p>
                      )}
                    </div>

                    <PrimaryButton type="submit" isLoading={isLoading} className="mt-2">
                      Unlock Account
                    </PrimaryButton>

                    <div className="relative flex items-center py-1.5">
                      <div className="flex-grow border-t border-nexa-border/40"></div>
                      <span className="flex-shrink mx-3 text-[9px] font-bold text-gray-500 uppercase tracking-widest font-mono">Or connect with</span>
                      <div className="flex-grow border-t border-nexa-border/40"></div>
                    </div>

                    <button
                      type="button"
                      onClick={handleGoogleLogin}
                      disabled={isLoading}
                      className="w-full bg-white hover:bg-[#F8F9FA] active:bg-[#F1F3F4] text-[#3C4043] font-semibold text-[11.5px] font-sans rounded-xl py-3 px-6 flex items-center justify-center space-x-3 border border-[#DADCE0] transition-all duration-200 cursor-pointer shadow-sm disabled:opacity-50"
                    >
                      <svg viewBox="0 0 24 24" width="18" height="18" className="flex-shrink-0" xmlns="http://www.w3.org/2000/svg">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05" />
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335" />
                      </svg>
                      <span className="tracking-normal">Continue with Google</span>
                    </button>

                    <div className="text-center pt-2">
                      <button
                        type="button"
                        onClick={() => setCurrentScreen('register')}
                        className="text-[10.5px] text-gray-400 hover:text-white transition cursor-pointer font-medium"
                      >
                        Don't have a vault? <span className="text-nexa-glow font-bold">Construct One</span>
                      </button>
                    </div>
                  </form>
                )}
              </GlassCard>
            </motion.div>
          )}

          {/* 4. FORGOT PASSWORD SCREEN */}
          {currentScreen === 'forgot' && (
            <motion.div
              key="forgot"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.3 }}
            >
              <GlassCard className="space-y-5">
                {/* Back button and title */}
                <div className="flex items-center space-x-3 pb-2 border-b border-nexa-border/50">
                  <button 
                    onClick={() => setCurrentScreen('login')}
                    className="p-2 rounded-lg bg-nexa-card hover:bg-nexa-border text-gray-400 hover:text-white transition cursor-pointer"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  <div>
                    <h2 className="text-sm font-extrabold font-display uppercase tracking-widest text-white">Reset Vault</h2>
                    <p className="text-[10px] text-gray-400">Recover credentials vault access</p>
                  </div>
                </div>

                {forgotSuccess ? (
                  <div className="py-6 flex flex-col items-center justify-center text-center space-y-4">
                    <div className="w-12 h-12 rounded-full bg-nexa-purple/15 border border-nexa-purple/60 flex items-center justify-center text-nexa-purple">
                      <Sparkles className="w-5 h-5 animate-spin duration-3000" />
                    </div>
                    <div className="space-y-1.5">
                      <p className="text-xs font-bold text-nexa-purple uppercase tracking-wider font-mono">Transmission Dispatched</p>
                      <p className="text-[11px] text-gray-300 leading-relaxed px-2">
                        We have transmitted a secure reset token link to <span className="text-white font-semibold">{forgotEmail}</span>. Check your inbox nodes.
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        setForgotSuccess(false);
                        setForgotEmail('');
                        setCurrentScreen('login');
                      }}
                      className="text-xs font-bold text-nexa-glow uppercase tracking-wider underline cursor-pointer mt-2"
                    >
                      Return to Authentication Gate
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleForgotPassword} className="space-y-4">
                    <p className="text-[11px] text-gray-400 leading-relaxed px-1">
                      Provide your security router email address below. We will transmit an encrypted vault recovery packet link.
                    </p>

                    <InputField 
                      label="Recovery Router Email"
                      type="email"
                      placeholder="name@domain.com"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      icon={<Mail className="w-4 h-4" />}
                      error={forgotError}
                    />

                    <PrimaryButton type="submit" isLoading={isLoading}>
                      Transmit Reset Packet
                    </PrimaryButton>

                    <div className="text-center pt-2">
                      <button
                        type="button"
                        onClick={() => setCurrentScreen('login')}
                        className="text-[10.5px] text-gray-400 hover:text-white transition cursor-pointer font-medium"
                      >
                        Remembered? <span className="text-nexa-glow font-bold">Authenticate Gate</span>
                      </button>
                    </div>
                  </form>
                )}
              </GlassCard>
            </motion.div>
          )}

        </AnimatePresence>
      </main>

      {/* Footer copyright protocols */}
      <footer className="w-full max-w-md text-center text-[9px] text-gray-600 font-mono mt-8 relative z-10">
        <p>STEEVEZALI INC • SECURE COMPANION CLIENT PROTOCOLS v1.0.0</p>
        <p className="mt-0.5 tracking-widest text-[8px] text-gray-700 uppercase">ALL VAULTS MULTI-KEY ENCRYPTED</p>
      </footer>
    </div>
  );
}
