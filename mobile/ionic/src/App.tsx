import { IonApp, IonRouterOutlet, IonSplitPane, setupIonicReact, IonLoading } from '@ionic/react';
import { IonReactRouter } from '@ionic/react-router';
import { Redirect, Route } from 'react-router-dom';
import Menu from './components/Menu';
import Pairing from './pages/Pairing';
import IssueList from './pages/IssueList';
import IssueDetail from './pages/IssueDetail';
import { useAuth } from './hooks/useAuth';

/* Core CSS required for Ionic components to work properly */
import '@ionic/react/css/core.css';

/* Basic CSS for apps built with Ionic */
import '@ionic/react/css/normalize.css';
import '@ionic/react/css/structure.css';
import '@ionic/react/css/typography.css';

/* Optional CSS utils that can be commented out */
import '@ionic/react/css/padding.css';
import '@ionic/react/css/float-elements.css';
import '@ionic/react/css/text-alignment.css';
import '@ionic/react/css/text-transformation.css';
import '@ionic/react/css/flex-utils.css';
import '@ionic/react/css/display.css';

/* import '@ionic/react/css/palettes/dark.always.css'; */
/* import '@ionic/react/css/palettes/dark.class.css'; */
import '@ionic/react/css/palettes/dark.system.css';

/* Theme variables */
import './theme/variables.css';

setupIonicReact();

const App: React.FC = () => {
  const { isAuthenticated } = useAuth();

  return (
    <IonApp>
      <div style={{ 
        position: 'fixed', 
        top: 'env(safe-area-inset-top, 0)', 
        left: 0, 
        width: '100%', 
        zIndex: 9999, 
        background: 'red', 
        color: 'white', 
        textAlign: 'center',
        fontSize: '10px',
        padding: '2px'
      }}>
        Converge-Ionic Debug: Auth={String(isAuthenticated)}
      </div>

      <IonReactRouter>
        <IonRouterOutlet>
          {isAuthenticated === null ? (
            <Route path="*">
              <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', background: '#121212' }}>
                <IonLoading isOpen={true} message="Checking session..." />
                <p style={{ color: 'white' }}>Initializing...</p>
              </div>
            </Route>
          ) : isAuthenticated ? (
            <>
              <Route path="/issues" exact={true} component={IssueList} />
              <Route path="/issues/:id" exact={true} component={IssueDetail} />
              <Route exact path="/">
                <Redirect to="/issues" />
              </Route>
            </>
          ) : (
            <>
              <Route path="/pairing" exact={true} component={Pairing} />
              <Route path="*">
                <Redirect to="/pairing" />
              </Route>
            </>
          )}
        </IonRouterOutlet>
      </IonReactRouter>
    </IonApp>
  );
};

export default App;
