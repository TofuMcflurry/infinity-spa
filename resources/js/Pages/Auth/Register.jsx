import { useEffect, useState } from 'react';
import { Head, Link, useForm } from '@inertiajs/react';
import spaLogin from "@/assets/spa-login.jpg";
import FloatingInput from "@/Components/ui/FloatingInput";
import SocialLoginButtons from "@/Components/ui/SocialLoginButtons";
import InputError from '@/Components/InputError';

export default function Register() {
    const { data, setData, post, processing, errors, reset } = useForm({
        name: '',
        email: '',
        phone: '',
        password: '',
        password_confirmation: '',
    });

    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');

    useEffect(() => {
        return () => {
            reset('password', 'password_confirmation');
        };
    }, []);

    // Update name when first/last name changes
    useEffect(() => {
        setData('name', `${firstName} ${lastName}`.trim());
    }, [firstName, lastName]);

    const submit = (e) => {
        e.preventDefault();
        
        // debug the payload and CSRF token
        console.log('Submitting payload:', data);
        const csrfMeta = document.querySelector('meta[name="csrf-token"]');
        console.log('CSRF token from meta tag:', csrfMeta?.getAttribute('content'));
        
        post(route('register'), {
            onSuccess: () => {
                console.log('Registration successful');
            },
            onError: (errors) => {
                console.log('Registration errors:', errors);
            }
        });
    };

    return (
        <div className="min-h-screen flex bg-background">
            <Head title="Register" />

            {/* Left: Image (hidden on mobile) */}
            <div className="hidden lg:block lg:w-1/2 relative">
                <div
                    className="absolute inset-0 bg-cover bg-center"
                    style={{ backgroundImage: `url(${spaLogin})` }}
                />
                <div className="absolute inset-0 bg-background/30" />
                <div className="absolute inset-0 mashrabiya-pattern" />
                <div className="absolute bottom-12 left-12 right-12">
                    <p className="font-accent text-champagne/60 tracking-[0.3em] uppercase text-xs mb-2">
                        Infinity Home Spa
                    </p>
                    <h2 className="font-display text-3xl text-foreground/90">
                        Begin your journey to<br />
                        <span className="text-shimmer">ultimate wellness</span>
                    </h2>
                </div>
            </div>

            {/* Right: Form */}
            <div className="w-full lg:w-1/2 flex items-center justify-center px-6 py-12 relative">
                <div className="absolute inset-0 mashrabiya-pattern opacity-30" />
                <div className="relative z-10 w-full max-w-md">
                    
                    <div className="lg:hidden text-center mb-10">
                        <p className="font-accent text-champagne tracking-[0.4em] uppercase text-xs mb-2">
                            Infinity Home Spa
                        </p>
                    </div>

                    <h1 className="font-display text-3xl sm:text-4xl text-foreground mb-2">
                        Create Account
                    </h1>
                    <p className="font-body text-muted-foreground text-sm mb-10">
                        Join Dubai's most exclusive home spa membership
                    </p>

                    <SocialLoginButtons />

                    <div className="flex items-center gap-4 my-8">
                        <div className="flex-1 h-px bg-border" />
                        <span className="font-body text-xs text-muted-foreground tracking-widest uppercase">or</span>
                        <div className="flex-1 h-px bg-border" />
                    </div>

                    <form className="space-y-7" onSubmit={submit}>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-7">
                            <div>
                                <FloatingInput 
                                    id="firstName" 
                                    label="First Name" 
                                    value={firstName}
                                    onChange={(e) => setFirstName(e.target.value)}
                                    required
                                />
                                {errors.name && !firstName && !lastName && (
                                    <InputError message={errors.name} className="mt-1" />
                                )}
                            </div>
                            <div>
                                <FloatingInput 
                                    id="lastName" 
                                    label="Last Name" 
                                    value={lastName}
                                    onChange={(e) => setLastName(e.target.value)}
                                    required
                                />
                            </div>
                        </div>

                        <div>
                            <FloatingInput 
                                id="email" 
                                label="Email Address" 
                                type="email" 
                                value={data.email}
                                onChange={(e) => setData('email', e.target.value)}
                                required
                            />
                            <InputError message={errors.email} className="mt-1" />
                        </div>

                        <div>
                            <FloatingInput 
                                id="phone" 
                                label="Phone Number" 
                                type="tel" 
                                value={data.phone}
                                onChange={(e) => setData('phone', e.target.value)}
                            />
                            <InputError message={errors.phone} className="mt-1" />
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
                            <InputError message={errors.password} className="mt-1" />
                        </div>

                        <div>
                            <FloatingInput 
                                id="confirmPassword" 
                                label="Confirm Password" 
                                type="password" 
                                value={data.password_confirmation}
                                onChange={(e) => setData('password_confirmation', e.target.value)}
                                required
                            />
                            <InputError message={errors.password_confirmation} className="mt-1" />
                        </div>

                        <label className="flex items-start gap-3 text-sm text-muted-foreground font-body cursor-pointer">
                            <input 
                                type="checkbox" 
                                className="accent-gold w-4 h-4 rounded mt-0.5" 
                                required 
                            />
                            <span>
                                I agree to the{" "}
                                <a href="#" className="text-gold hover:text-gold-light transition-colors">Terms of Service</a>
                                {" "}and{" "}
                                <a href="#" className="text-gold hover:text-gold-light transition-colors">Privacy Policy</a>
                            </span>
                        </label>

                        <button
                            type="submit"
                            disabled={processing}
                            className="w-full py-4 bg-primary text-primary-foreground font-body text-sm tracking-[0.2em] uppercase rounded-sm glow-gold hover:glow-gold-strong transition-all duration-300 disabled:opacity-50"
                        >
                            {processing ? 'Creating Account...' : 'Create Account'}
                        </button>
                    </form>

                    <p className="mt-8 text-center text-sm text-muted-foreground font-body">
                        Already a member?{" "}
                        <Link href={route('login')} className="text-gold hover:text-gold-light transition-colors">
                            Sign in
                        </Link>
                    </p>

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