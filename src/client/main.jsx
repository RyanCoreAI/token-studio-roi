import { createRoot } from 'react-dom/client';
import { App } from './dashboard/App.jsx';
import { ReviewApp } from './review/ReviewApp.jsx';
import { LiveApp } from './live/LiveApp.jsx';

function Root() {
  if (window.location.pathname === '/review') {
    document.title = 'ROI Review · Token Studio ROI';
    return <ReviewApp />;
  }
  if (window.location.pathname === '/live') {
    document.title = 'Live Monitor · Token Studio ROI';
    return <LiveApp />;
  }
  if (window.location.pathname === '/trust') {
    document.title = 'Local Trust · Token Studio ROI';
    return <App routeMode="trust" />;
  }

  document.title = 'Token Studio ROI';
  return <App />;
}

createRoot(document.getElementById('root')).render(<Root />);
