import {
  IonContent,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonMenu,
  IonMenuToggle,
  IonNote,
} from '@ionic/react';

import { useLocation } from 'react-router-dom';
import { 
  listOutline, 
  listSharp, 
  logOutOutline, 
  logOutSharp,
  starOutline,
  starSharp,
  settingsOutline,
  settingsSharp
} from 'ionicons/icons';
import './Menu.css';
import { useAuth } from '../hooks/useAuth';

interface AppPage {
  url: string;
  iosIcon: string;
  mdIcon: string;
  title: string;
}

const appPages: AppPage[] = [
  {
    title: 'Issues',
    url: '/issues',
    iosIcon: listOutline,
    mdIcon: listSharp
  },
  {
    title: 'Favorites',
    url: '/issues?filter=favorites',
    iosIcon: starOutline,
    mdIcon: starSharp
  },
  {
    title: 'Settings',
    url: '/settings',
    iosIcon: settingsOutline,
    mdIcon: settingsSharp
  }
];

const Menu: React.FC = () => {
  const location = useLocation();
  const { logout } = useAuth();

  const handleLogout = async () => {
    await logout();
  };

  return (
    <IonMenu contentId="main" type="overlay">
      <IonContent>
        <IonList id="inbox-list">
          <IonListHeader>Redmine</IonListHeader>
          <IonNote>Mobile Dashboard</IonNote>
          {appPages.map((appPage, index) => {
            return (
              <IonMenuToggle key={index} autoHide={false}>
                <IonItem 
                  className={location.pathname === appPage.url ? 'selected' : ''} 
                  routerLink={appPage.url} 
                  routerDirection="none" 
                  lines="none" 
                  detail={false}
                >
                  <IonIcon aria-hidden="true" slot="start" ios={appPage.iosIcon} md={appPage.mdIcon} />
                  <IonLabel>{appPage.title}</IonLabel>
                </IonItem>
              </IonMenuToggle>
            );
          })}
          
          <IonItem button onClick={handleLogout} lines="none" detail={false}>
            <IonIcon aria-hidden="true" slot="start" ios={logOutOutline} md={logOutSharp} />
            <IonLabel>Logout</IonLabel>
          </IonItem>
        </IonList>
      </IonContent>
    </IonMenu>
  );
};

export default Menu;
