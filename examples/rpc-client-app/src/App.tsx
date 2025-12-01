import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css'
import createFetchClient from "openapi-fetch";
import createClient from "openapi-react-query";


import type {paths} from "../schema";


const fetchClient = createFetchClient<paths>({baseUrl: "http://0.0.0.0:1190/v1/api"});
const $api = createClient(fetchClient)

function App() {

    const {data, error, isLoading} = $api.useQuery(
        "get",
        "/health-check"
    )

    if (isLoading || !data) return <p style={{color: 'green', marginTop: '1rem'}}>Loading...</p>;

    return (
        <>
            <div>
                <a href="https://vite.dev" target="_blank">
                    <img src={viteLogo} className="logo" alt="Vite logo"/>
                </a>
                <a href="https://react.dev" target="_blank">
                    <img src={reactLogo} className="logo react" alt="React logo"/>
                </a>
            </div>
            <h1>Ignis RPC Demo</h1>

            {/* Health Check Section */}
            <div className="card">
                <h2>API Health Check</h2>
                <p style={{color: 'green', marginTop: '1rem'}}>
                    ✓ Server Status: <strong>{data.status}</strong>
                </p>

                {error && (
                    <p style={{color: 'red', marginTop: '1rem'}}>
                        ✗ Error: {error}
                    </p>
                )}
            </div>

            <p className="read-the-docs">
                Type-safe with openapi typescript  + Ignis Framework
            </p>
        </>
    )
}

export default App
