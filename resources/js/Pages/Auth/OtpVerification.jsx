import { useEffect, useState } from 'react';
import { Head, useForm } from '@inertiajs/react';
import InputError from '@/Components/InputError';
import PrimaryButton from '@/Components/PrimaryButton';
import TextInput from '@/Components/TextInput';
import axios from 'axios';

export default function OtpVerification({ email: initialEmail }) {
    const [countdown, setCountdown] = useState(60);
    const [canResend, setCanResend] = useState(false);
    const [resending, setResending] = useState(false);
    const [resendError, setResendError] = useState('');
    const [resendStatus, setResendStatus] = useState('');
    
    const { data, setData, post, processing, errors, reset, clearErrors } = useForm({
        email: initialEmail || '',
        code: '',
    });

    useEffect(() => {
        let timer;
        if (countdown > 0 && !canResend) {
            timer = setTimeout(() => setCountdown(countdown - 1), 1000);
        } else {
            setCanResend(true);
        }
        return () => clearTimeout(timer);
    }, [countdown, canResend]);

    const submit = (e) => {
        e.preventDefault();
        setResendError('');
        setResendStatus('');
        post(route('otp.verify'));
    };

    const resendCode = async () => {
        if (resending || processing || !canResend) return;
        setResending(true);
        clearErrors('code');
        setResendError('');
        setResendStatus('');
        try {
            // Axios sends Laravel's same-origin XSRF cookie; the server owns the flow.
            await axios.post(route('otp.send'), {}, { headers: { Accept: 'application/json' } });
            setCountdown(60);
            setCanResend(false);
            reset('code');
            setResendStatus('A new verification code has been sent.');
        } catch (error) {
            const codeError = error.response?.data?.errors?.code;
            if (error.response?.status === 422 && codeError) {
                setResendError(Array.isArray(codeError) ? codeError[0] : codeError);
            } else if ([401, 403, 419].includes(error.response?.status)) {
                setResendError('Your verification session has expired. Please sign in again.');
            } else if (error.response?.status === 429) {
                setResendError('Too many verification requests. Please try again later.');
            } else {
                setResendError('Unable to resend the code. Please wait before trying again.');
            }
        } finally {
            setResending(false);
        }
    };

    return (
        <>
            <Head title="Verify OTP" />
            
            <div className="min-h-screen flex flex-col sm:justify-center items-center pt-6 sm:pt-0 bg-gray-100">
                <div className="w-full sm:max-w-md mt-6 px-6 py-4 bg-white shadow-md overflow-hidden sm:rounded-lg">
                    <h2 className="text-2xl font-bold text-center mb-4">Verify Your Account</h2>
                    
                    <p className="text-gray-600 text-center mb-6">
                        We've sent a 6-digit verification code to {data.email || 'your email'}
                    </p>

                    <form onSubmit={submit}>
                        <div>
                            <TextInput
                                id="code"
                                type="text"
                                name="code"
                                value={data.code}
                                className="mt-1 block w-full text-center text-2xl tracking-widest"
                                placeholder="000000"
                                maxLength="6"
                                onChange={(e) => setData('code', e.target.value)}
                                required
                                autoFocus
                            />
                            <div role="alert">
                                <InputError message={resendError || errors.code} className="mt-2" />
                            </div>
                            {resendStatus && <p role="status" className="mt-2 text-sm text-green-600">{resendStatus}</p>}
                        </div>

                        <div className="flex items-center justify-between mt-4">
                            <button
                                type="button"
                                onClick={resendCode}
                                disabled={!canResend || processing || resending}
                                className="text-sm text-indigo-600 hover:text-indigo-900 disabled:opacity-25"
                            >
                                {resending ? 'Sending…' : (canResend ? 'Resend Code' : `Resend in ${countdown}s`)}
                            </button>

                            <PrimaryButton className="ml-4" disabled={processing || resending}>
                                Verify
                            </PrimaryButton>
                        </div>
                    </form>
                </div>
            </div>
        </>
    );
}
