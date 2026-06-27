import ReactDOM from 'react-dom/client';
import App from './App';
import { initAnalytics } from './lib/analytics';

void initAnalytics();

ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
