import './App.css'
import createFetchClient from "openapi-fetch";
import createClient from "openapi-react-query";
import type {paths} from "../schema";
import DOMPurify from 'dompurify';


const fetchClient = createFetchClient<paths>({baseUrl: "http://0.0.0.0:1190/v1/api"});
const $api = createClient(fetchClient)

function App() {

    const {data, isLoading} = $api.useQuery(
        "get",
        "/about",
        {
            parseAs: "text"
        }
    )

    if (isLoading || !data) return <p style={{color: 'green', marginTop: '1rem'}}>Loading...</p>;

    // Sanitize the HTML content to prevent XSS attacks
    const sanitizedHtml = DOMPurify.sanitize(data as string);

    return (
        <>
            <div dangerouslySetInnerHTML={{__html: sanitizedHtml}} />
            <p className="read-the-docs">
                Type-safe with openapi typescript + Ignis Framework
            </p>
        </>
    )
}

export default App
