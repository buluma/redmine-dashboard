import React, { useState, useEffect, useCallback } from 'react';
import {
  IonContent,
  IonHeader,
  IonPage,
  IonTitle,
  IonToolbar,
  IonList,
  IonItem,
  IonLabel,
  IonSearchbar,
  IonRefresher,
  IonRefresherContent,
  IonButtons,
  IonMenuButton,
  IonBadge,
  IonNote,
  IonIcon,
  IonLoading,
} from '@ionic/react';
import { star, starOutline } from 'ionicons/icons';
import api from '../lib/api-client';
import { Issue, IssueQueryResponse } from '../types';

const IssueList: React.FC = () => {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');

  const fetchIssues = useCallback(async (refresh = false) => {
    if (refresh) setLoading(true);
    try {
      const response = await api.get<IssueQueryResponse>('/issues', {
        params: {
          search: searchText,
          searchMode: 'hybrid',
          pageSize: 50,
        },
      });
      setIssues(response.data.items);
    } catch (err) {
      console.error('Failed to fetch issues', err);
    } finally {
      setLoading(false);
    }
  }, [searchText]);

  useEffect(() => {
    fetchIssues();
  }, [fetchIssues]);

  const handleRefresh = async (event: CustomEvent) => {
    await fetchIssues(true);
    event.detail.complete();
  };

  const getStatusColor = (status: string) => {
    const s = status.toLowerCase();
    if (s.includes('new')) return 'primary';
    if (s.includes('progress')) return 'warning';
    if (s.includes('resolved') || s.includes('closed')) return 'success';
    if (s.includes('reject') || s.includes('fail')) return 'danger';
    return 'medium';
  };

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonMenuButton />
          </IonButtons>
          <IonTitle>Issues</IonTitle>
        </IonToolbar>
        <IonToolbar>
          <IonSearchbar
            value={searchText}
            onIonInput={(e) => setSearchText(e.detail.value!)}
            placeholder="Search issues..."
            debounce={500}
          />
        </IonToolbar>
      </IonHeader>
      <IonContent>
        <IonRefresher slot="fixed" onIonRefresh={handleRefresh}>
          <IonRefresherContent />
        </IonRefresher>

        <IonLoading isOpen={loading} message="Loading issues..." />

        <IonList>
          {issues.map((issue) => (
            <IonItem key={issue.id} routerLink={`/issues/${issue.id}`}>
              <IonLabel>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h2 style={{ fontWeight: 'bold' }}>
                    {issue.source === 'local' ? `L${issue.localIssueNumber}` : `#${issue.redmineIssueId}`}
                  </h2>
                  <IonIcon
                    icon={issue.isFavorited ? star : starOutline}
                    color={issue.isFavorited ? 'warning' : 'medium'}
                  />
                </div>
                <h3>{issue.subject}</h3>
                <p>{issue.projectName || 'No Project'}</p>
                <div style={{ marginTop: '5px' }}>
                  <IonBadge color={getStatusColor(issue.statusName)}>
                    {issue.statusName}
                  </IonBadge>
                  {issue.priority && (
                    <IonNote style={{ marginLeft: '10px' }}>
                      {issue.priority}
                    </IonNote>
                  )}
                </div>
              </IonLabel>
            </IonItem>
          ))}
        </IonList>

        {issues.length === 0 && !loading && (
          <div className="ion-padding" style={{ textAlign: 'center' }}>
            <p>No issues found.</p>
          </div>
        )}
      </IonContent>
    </IonPage>
  );
};

export default IssueList;
