import { useEffect } from 'react';
import { Head, Link, useForm } from '@inertiajs/react';
import spaLogin from "@/assets/spa-login.jpg";
import FloatingInput from "@/Components/ui/FloatingInput";
import SocialLoginButtons from "@/Components/ui/SocialLoginButtons";
import InputError from '@/Components/InputError';

export default function Login({ status, canResetPassword }) {
    const { data, setData, post, processing, errors, reset } = useForm({
        email: '',
        password: '',
        remember: false,
    });

    useEffect(() => {
        return () => {
            reset('password');
        };
    }, []);

    const submit = (e) => {
        e.preventDefault();
        post(route('login'));
    };

    return (
        <div className="min-h-screen flex bg-background">
            <Head title="Log in" />

            {/* Left: Image (hidden on mobile) */}
            <div className="hidden lg:block lg:w-1/2 relative">
                <div
                    className="absolute inset-0 bg-cover bg-center"
                    style={{ backgroundImage: `url(${spaLogin})` }}
                />
                <div className="absolute inset-0 bg-background/30" />
                <div className="absolute inset-0 mashrabiya-pattern" />
                
                {/* Brand overlay */}
                <div className="absolute bottom-12 left-12 right-12">
                    <p className="font-accent text-champagne/60 tracking-[0.3em] uppercase text-xs mb-2">
                        Infinity Home Spa
                    </p>
                    <h2 className="font-display text-3xl text-foreground/90">
                        Welcome back to<br />
                        <span className="text-shimmer">your sanctuary</span>
                    </h2>
                </div>
            </div>

            {/* Right: Form */}
            <div className="w-full lg:w-1/2 flex items-center justify-center px-6 py-12 relative">
                <div className="absolute inset-0 mashrabiya-pattern opacity-30" />
                <div className="relative z-10 w-full max-w-md">
                    
                    {/* Mobile brand */}
                    <div className="lg:hidden text-center mb-10">
                        <p className="font-accent text-champagne tracking-[0.4em] uppercase text-xs mb-2">
                            Infinity Home Spa
                        </p>
                    </div>

                    <h1 className="font-display text-3xl sm:text-4xl text-foreground mb-2">
                        Sign In
                    </h1>
                    <p className="font-body text-muted-foreground text-sm mb-10">
                        Access your exclusive spa experience
                    </p>

                    {status && (
                        <div className="mb-4 text-sm font-medium text-green-600">
                            {status}
                        </div>
                    )}

                    {/* Social Logins */}
                    <SocialLoginButtons />

                    {/* Divider */}
                    <div className="flex items-center gap-4 my-8">
                        <div className="flex-1 h-px bg-border" />
                        <span className="font-body text-xs text-muted-foreground tracking-widest uppercase">or</span>
                        <div className="flex-1 h-px bg-border" />
                    </div>

                    {/* Form */}
                    <form className="space-y-8" onSubmit={submit}>
                        <div>
                            <FloatingInput 
                                id="email" 
                                label="Email Address" 
                                type="email" 
                                value={data.email}
                                onChange={(e) => setData('email', e.target.value)}
                                required
                            />
                            <InputError message={errors.email} className="mt-2" />
                        </div>

                        <div>
                            <FloatingInput 
                                id="password" 
                                label="Password" 
                                type="password" 
                                value={data.password}
                                onChange={(e) => setData('password', e.target.value)}
                                required
                            />
                            <InputError message={errors.password} className="mt-2" />
                        </div>

                        <div className="flex items-center justify-between text-sm">
                            <label className="flex items-center gap-2 text-muted-foreground font-body cursor-pointer">
                                <input 
                                    type="checkbox" 
                                    name="remember"
                                    checked={data.remember}
                                    onChange={(e) => setData('remember', e.target.checked)}
                                    className="accent-gold w-4 h-4 rounded border-gray-300" 
                                />
                                Remember me
                            </label>
                            {canResetPassword && (
                                <Link href={route('password.request')} className="text-gold hover:text-gold-light transition-colors font-body">
                                    Forgot password?
                                </Link>
                            )}
                        </div>

                        <button
                            type="submit"
                            disabled={processing}
                            className="w-full py-4 bg-primary text-primary-foreground font-body text-sm tracking-[0.2em] uppercase rounded-sm glow-gold hover:glow-gold-strong transition-all duration-300 disabled:opacity-50"
                        >
                            {processing ? 'Signing In...' : 'Sign In'}
                        </button>
                    </form>

                    <p className="mt-8 text-center text-sm text-muted-foreground font-body">
                        New to Infinity?{" "}
                        <Link href={route('register')} className="text-gold hover:text-gold-light transition-colors">
                            Create an account
                        </Link>
                    </p>

                    {/* Back to home */}
                    <div className="mt-6 text-center">
                        <Link href="/" className="text-xs text-muted-foreground hover:text-foreground transition-colors font-body tracking-widest uppercase">
                            ← Back to Home
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}