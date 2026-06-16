import { createRoot } from 'react-dom/client';
import { App } from './dashboard/App.jsx';
import { ReviewApp } from './review/ReviewApp.jsx';

function Root() {
  if (window.location.pathname === '/review') {
    document.title = 'ROI Review · Token Studio ROI';
    return <ReviewApp />;
  }

  document.title = 'Token Studio ROI';
  return <App />;
}

createRoot(document.getElementById('root')).render(<Root />);
