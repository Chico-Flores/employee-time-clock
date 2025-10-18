// src/components/Login.tsx
// COMPLETE FILE - Replace your entire Login.tsx with this
import React, { useState } from 'react';
import axios from 'axios';
import QuickAdminLogin from './QuickAdminLogin';

interface LoginProps {
    showLogin: boolean;
    onLoginSuccess: () => void;
    onCloseOverlay: () => void;
}

const Login: React.FC<LoginProps> = ({ showLogin, onLoginSuccess, onCloseOverlay }) => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [useQuickLogin, setUseQuickLogin] = useState(true); // Start with Quick Login by default

    const handleLogin = async () => {
        try {
            const response = await axios.post('/login', { username, password });
            if (response.data.success) {
                onLoginSuccess();
            } else {
                setError('Invalid credentials');
            }
        } catch (err) {
            setError('Invalid credentials');
        }
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !useQuickLogin) {
            handleLogin();
        }
    };

    return (
        showLogin && (
            <div className="login-overlay">
                <div className="login-container">
                    <button className="close-btn" onClick={onCloseOverlay}>X</button>
                    
                    {useQuickLogin ? (
                        // Quick Admin Login (PIN-based)
                        <QuickAdminLogin
                            onLoginSuccess={onLoginSuccess}
                            onSwitchToRegularLogin={() => {
                                setUseQuickLogin(false);
                                setError('');
                            }}
                        />
                    ) : (
                        // Regular Login (Username/Password)
                        <>
                            <h1>Admin Login</h1>
                            <small style={{ display: 'block', marginBottom: '20px', color: '#6b7280' }}>
                                Login with your username and password
                            </small>
                            
                            <div>
                                <input
                                    type="text"
                                    placeholder="Username"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    onKeyPress={handleKeyPress}
                                />
                            </div>
                            <div>
                                <input
                                    type="password"
                                    placeholder="Password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    onKeyPress={handleKeyPress}
                                />
                            </div>
                            {error && <div className="login-error">{error}</div>}
                            <button id="login" onClick={handleLogin}>Login</button>
                            
                            <div style={{ textAlign: 'center', marginTop: '16px' }}>
                                <button
                                    onClick={() => {
                                        setUseQuickLogin(true);
                                        setError('');
                                        setUsername('');
                                        setPassword('');
                                    }}
                                    style={{
                                        background: 'transparent',
                                        border: 'none',
                                        color: '#2563eb',
                                        fontSize: '14px',
                                        fontWeight: '600',
                                        cursor: 'pointer',
                                        textDecoration: 'underline',
                                        padding: '8px'
                                    }}
                                    onMouseOver={(e) => e.currentTarget.style.color = '#1e40af'}
                                    onMouseOut={(e) => e.currentTarget.style.color = '#2563eb'}
                                >
                                    ← Use Quick Admin Access (PIN)
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        )
    );
};

export default Login;
