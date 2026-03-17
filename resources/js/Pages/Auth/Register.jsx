import { useEffect, useState } from 'react';
import { Head, Link, useForm } from '@inertiajs/react';
import spaLogin from "@/assets/spa-login.jpg";
import FloatingInput from "@/Components/ui/FloatingInput";
import SocialLoginButtons from "@/Components/SocialLoginButtons";
import InputError from '@/Components/InputError';
import InputLabel from '@/Components/InputLabel';
import TextInput from '@/Components/TextInput';

export default function Register() {
    const { data, setData, post, processing, errors, reset } = useForm({
        name: '',
        email: '',
        phone: '', // <--- ADD THIS!
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

    useEffect(() => {
        setData('name', `${firstName} ${lastName}`.trim());
    }, [firstName, lastName]);

    const submit = (e) => {
        e.preventDefault();
        post(route('register'));
    };

    return (
        <div className="min-h-screen flex bg-background">
            <Head title="Register" />

            {/* Left: Image */}
            <div className="hidden lg:block lg:w-1/2 relative">
                <div
                    className="absolute inset-0 bg-cover bg-center"
                    style={{ backgroundImage: `url(${spaLogin})` }}
                />
                <div className="absolute inset-0 bg-background/30" />
                <div className="absolute inset-0 mashrabiya-pattern" />
            </div>

            {/* Right: Form */}
            <div className="w-full lg:w-1/2 flex items-center justify-center px-6 py-12">
                <div className="w-full max-w-md">
                    <h1 className="font-display text-3xl sm:text-4xl text-foreground mb-2">
                        Create Account
                    </h1>
                    <p className="font-body text-muted-foreground text-sm mb-10">
                        Join Dubai's most exclusive home spa membership
                    </p>

                    {/* Google Button */}
                    <SocialLoginButtons />

                    <div className="flex items-center gap-4 my-8">
                        <div className="flex-1 h-px bg-border" />
                        <span className="font-body text-xs text-muted-foreground tracking-widest uppercase">or</span>
                        <div className="flex-1 h-px bg-border" />
                    </div>

                    <form className="space-y-7" onSubmit={submit}>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-7">
                            <FloatingInput 
                                label="First Name" 
                                value={firstName}
                                onChange={(e) => setFirstName(e.target.value)}
                                required
                            />
                            <FloatingInput 
                                label="Last Name" 
                                value={lastName}
                                onChange={(e) => setLastName(e.target.value)}
                                required
                            />
                        </div>

                        <FloatingInput 
                            label="Email Address" 
                            type="email" 
                            value={data.email}
                            onChange={(e) => setData('email', e.target.value)}
                            required
                        />
                        <InputError message={errors.email} />

                        {/* PHONE FIELD - ADDED HERE */}
                        <FloatingInput 
                            label="Phone Number" 
                            type="tel" 
                            value={data.phone}
                            onChange={(e) => setData('phone', e.target.value)}
                        />
                        <InputError message={errors.phone} />

                        <FloatingInput 
                            label="Password" 
                            type="password" 
                            value={data.password}
                            onChange={(e) => setData('password', e.target.value)}
                            required
                        />
                        <InputError message={errors.password} />

                        <FloatingInput 
                            label="Confirm Password" 
                            type="password" 
                            value={data.password_confirmation}
                            onChange={(e) => setData('password_confirmation', e.target.value)}
                            required
                        />
                        <InputError message={errors.password_confirmation} />

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
                </div>
            </div>
        </div>
    );
}