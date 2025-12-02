import './App.css'
import createFetchClient from "openapi-fetch";
import createClient from "openapi-react-query";
import type {paths} from "../schema";
import DOMPurify from 'dompurify';
import { useActionState } from 'react';

const fetchClient = createFetchClient<paths>({baseUrl: "http://0.0.0.0:1190/v1/api"});
const $api = createClient(fetchClient)

type FormState = {
    status: 'idle' | 'pending' | 'success' | 'error';
    message?: string;
};

function App() {
    const signUpMutation = $api.useMutation("post", "/auth/sign-up")

    const signUpAction = async (_prevState: FormState, formData: FormData): Promise<FormState> => {
        const username = formData.get('username') as string;
        const credential = formData.get('credential') as string;

        try {
            await signUpMutation.mutateAsync({
                body: { username, credential }
            });
            return { status: 'success', message: 'Sign up successful!' };
        } catch (error: unknown) {
            return { 
                status: 'error', 
                message: error || 'Sign up failed. Please try again.'
            };
        }
    };

    const [state, formAction, isPending] = useActionState(signUpAction, { status: 'idle' });

    const {data, isLoading} = $api.useQuery(
        "get",
        "/about",
        {
            parseAs: "text"
        }
    )

    if (isLoading || !data) return <p style={{color: 'green', marginTop: '1rem'}}>Loading...</p>;

    const sanitizedHtml = DOMPurify.sanitize(data as string);

    return (
        <>
            <div dangerouslySetInnerHTML={{__html: sanitizedHtml}}/>

            <div style={{
                maxWidth: '400px',
                margin: '2rem auto',
                padding: '2rem',
                border: '1px solid #646cff',
                borderRadius: '8px',
                backgroundColor: 'rgba(255, 255, 255, 0.05)'
            }}>
                <h2 style={{marginTop: 0, marginBottom: '1.5rem', textAlign: 'center'}}>Sign Up</h2>

                <form action={formAction} style={{display: 'flex', flexDirection: 'column', gap: '1rem'}}>
                    <div style={{display: 'flex', flexDirection: 'column', gap: '0.5rem'}}>
                        <label htmlFor="username" style={{fontSize: '0.9rem', fontWeight: '500'}}>
                            Username
                        </label>
                        <input
                            id="username"
                            name="username"
                            type="text"
                            required
                            placeholder="Enter username"
                            disabled={isPending}
                            style={{
                                padding: '0.75rem',
                                borderRadius: '4px',
                                border: '1px solid #646cff',
                                backgroundColor: 'transparent',
                                color: 'inherit',
                                fontSize: '1rem'
                            }}
                        />
                    </div>

                    <div style={{display: 'flex', flexDirection: 'column', gap: '0.5rem'}}>
                        <label htmlFor="credential" style={{fontSize: '0.9rem', fontWeight: '500'}}>
                            Password
                        </label>
                        <input
                            id="credential"
                            name="credential"
                            type="password"
                            required
                            placeholder="Enter password"
                            disabled={isPending}
                            style={{
                                padding: '0.75rem',
                                borderRadius: '4px',
                                border: '1px solid #646cff',
                                backgroundColor: 'transparent',
                                color: 'inherit',
                                fontSize: '1rem'
                            }}
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={isPending}
                        style={{
                            padding: '0.75rem',
                            borderRadius: '4px',
                            border: 'none',
                            backgroundColor: '#646cff',
                            color: 'white',
                            fontSize: '1rem',
                            fontWeight: '600',
                            cursor: isPending ? 'not-allowed' : 'pointer',
                            opacity: isPending ? 0.6 : 1,
                            marginTop: '0.5rem'
                        }}
                    >
                        {isPending ? 'Signing up...' : 'Sign Up'}
                    </button>

                    {state.status === 'error' && state.message && (
                        <p style={{color: '#ff6b6b', margin: 0, fontSize: '0.9rem'}}>
                            Error: {state.message}
                        </p>
                    )}

                    {state.status === 'success' && state.message && (
                        <p style={{color: '#51cf66', margin: 0, fontSize: '0.9rem'}}>
                            {state.message} ✓
                        </p>
                    )}
                </form>
            </div>

            <p className="read-the-docs">
                Type-safe with openapi typescript + Ignis Framework
            </p>
        </>
    )
}

export default App
