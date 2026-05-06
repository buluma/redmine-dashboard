import React, { useState, useEffect } from 'react';
import {
  IonContent,
  IonHeader,
  IonPage,
  IonTitle,
  IonToolbar,
  IonButtons,
  IonBackButton,
  IonLoading,
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonCardSubtitle,
  IonCardContent,
  IonSegment,
  IonSegmentButton,
  IonLabel,
  IonList,
  IonItem,
  IonNote,
  IonBadge,
  IonAvatar,
} from '@ionic/react';
import { useParams } from 'react-router-dom';
import api from '../lib/api-client';
import { Issue } from '../types';

const IssueDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [issue, setIssue] = useState<Issue | null>(null);
  const [loading, setLoading] = useState(true);
  const [segment, setSegment] = useState<'details' | 'comments' | 'time'>('details');

  useEffect(() => {
    const fetchIssue = async () => {
      setLoading(true);
      try {
        const response = await api.get<{ issue: Issue }>(`/issues/${id}`);
        setIssue(response.data.issue);
      } catch (err) {
        console.error('Failed to fetch issue detail', err);
      } finally {
        setLoading(false);
      }
    };
    fetchIssue();
  }, [id]);

  if (loading) return <IonLoading isOpen={true} message="Loading details..." />;
  if (!issue) return <IonPage><IonContent>Issue not found</IonContent></IonPage>;

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton defaultHref="/issues" />
          </IonButtons>
          <IonTitle>
            {issue.source === 'local' ? `L${issue.localIssueNumber}` : `#${issue.redmineIssueId}`}
          </IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent>
        <IonCard>
          <IonCardHeader>
            <IonCardSubtitle>{issue.projectName} / {issue.tracker}</IonCardSubtitle>
            <IonCardTitle>{issue.subject}</IonCardTitle>
            <div style={{ marginTop: '10px' }}>
              <IonBadge color="primary">{issue.statusName}</IonBadge>
              {issue.priority && <IonNote style={{ marginLeft: '10px' }}>{issue.priority}</IonNote>}
            </div>
          </IonCardHeader>
        </IonCard>

        <IonSegment value={segment} onIonChange={(e) => setSegment(e.detail.value as any)}>
          <IonSegmentButton value="details">
            <IonLabel>Details</IonLabel>
          </IonSegmentButton>
          <IonSegmentButton value="comments">
            <IonLabel>Comments</IonLabel>
          </IonSegmentButton>
          <IonSegmentButton value="time">
            <IonLabel>Time</IonLabel>
          </IonSegmentButton>
        </IonSegment>

        <div className="ion-padding">
          {segment === 'details' && (
            <div>
              <h3>Description</h3>
              <div style={{ whiteSpace: 'pre-wrap' }}>
                {issue.description || 'No description provided.'}
              </div>
              
              <IonList style={{ marginTop: '20px' }}>
                <IonItem>
                  <IonLabel>
                    <h3>Assignee</h3>
                    <p>{issue.assignedToName || 'Unassigned'}</p>
                  </IonLabel>
                </IonItem>
                <IonItem>
                  <IonLabel>
                    <h3>Last Update</h3>
                    <p>{new Date(issue.updatedAt).toLocaleString()}</p>
                  </IonLabel>
                </IonItem>
              </IonList>
            </div>
          )}

          {segment === 'comments' && (
            <IonList>
              {issue.journals && issue.journals.length > 0 ? (
                issue.journals.map((j) => (
                  <IonItem key={j.id} lines="full">
                    <IonLabel className="ion-text-wrap">
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                        <strong style={{ color: 'var(--ion-color-primary)' }}>{j.user}</strong>
                        <IonNote slot="end" style={{ fontSize: '0.8em' }}>
                          {new Date(j.createdOnRemote).toLocaleDateString()}
                        </IonNote>
                      </div>
                      <p>{j.notes || <IonNote>Status change or attribute update</IonNote>}</p>
                    </IonLabel>
                  </IonItem>
                ))
              ) : (
                <div style={{ textAlign: 'center', marginTop: '20px' }}>No comments found.</div>
              )}
            </IonList>
          )}

          {segment === 'time' && (
            <IonList>
              {issue.timeEntries && issue.timeEntries.length > 0 ? (
                issue.timeEntries.map((t) => (
                  <IonItem key={t.id}>
                    <IonLabel>
                      <h3>{t.hours}h - {t.activityName}</h3>
                      <p>{t.comments || 'No comment'}</p>
                      <IonNote>{new Date(t.spentOn).toLocaleDateString()}</IonNote>
                    </IonLabel>
                  </IonItem>
                ))
              ) : (
                <div style={{ textAlign: 'center', marginTop: '20px' }}>No time entries found.</div>
              )}
            </IonList>
          )}
        </div>
      </IonContent>
    </IonPage>
  );
};

export default IssueDetail;
