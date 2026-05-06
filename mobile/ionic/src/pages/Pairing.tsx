import React, { useState } from 'react';
import {
  IonContent,
  IonHeader,
  IonPage,
  IonTitle,
  IonToolbar,
  IonList,
  IonItem,
  IonLabel,
  IonInput,
  IonButton,
  IonText,
  IonLoading,
  IonToast,
} from '@ionic/react';
import api from '../lib/api-client';
import { useAuth } from '../hooks/useAuth';

const Pairing: React.FC = () => {
  const { login } = useAuth();
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [deviceName, setDeviceName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showToast, setShowToast] = useState(false);

  const handlePairing = async () => {
    if (!baseUrl || !apiKey) {
      setError('Base URL and API Key are required');
      setShowToast(true);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await api.post('/pair/connect', {
        baseUrl,
        apiKey,
        deviceName: deviceName || 'Ionic Device',
      });

      const { token } = response.data;
      await login(token);
    } catch (err: any) {
      const message = err.response?.data?.error || err.message || 'Pairing failed';
      setError(message);
      setShowToast(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <IonPage style={{ background: 'var(--ion-background-color, #fff)' }}>
      <IonHeader>
        <IonToolbar color="primary">
          <IonTitle>Converge-Ionic Pairing</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent className="ion-padding">
        <div style={{ textAlign: 'center', marginBottom: '30px', marginTop: '20px' }}>
          <h1 style={{ color: 'var(--ion-color-primary)' }}>Welcome</h1>
          <p>Connect your Redmine dashboard to get started.</p>
        </div>

        <IonList>
          <IonItem>
            <IonLabel position="stacked">Redmine Base URL</IonLabel>
            <IonInput
              type="url"
              placeholder="https://redmine.example.com"
              value={baseUrl}
              onIonInput={(e) => setBaseUrl(e.detail.value!)}
            />
          </IonItem>

          <IonItem>
            <IonLabel position="stacked">API Key</IonLabel>
            <IonInput
              type="password"
              placeholder="Your Redmine API Key"
              value={apiKey}
              onIonInput={(e) => setApiKey(e.detail.value!)}
            />
          </IonItem>

          <IonItem>
            <IonLabel position="stacked">Device Name (Optional)</IonLabel>
            <IonInput
              type="text"
              placeholder="My Phone"
              value={deviceName}
              onIonInput={(e) => setDeviceName(e.detail.value!)}
            />
          </IonItem>
        </IonList>

        <div className="ion-margin-top">
          <IonButton expand="block" onClick={handlePairing}>
            Pair Now
          </IonButton>
        </div>

        <IonLoading isOpen={loading} message="Pairing device..." />
        <IonToast
          isOpen={showToast}
          onDidDismiss={() => setShowToast(false)}
          message={error || ''}
          duration={3000}
          color="danger"
        />
      </IonContent>
    </IonPage>
  );
};

export default Pairing;
