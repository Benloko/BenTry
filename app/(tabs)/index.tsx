import React, { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Image, ScrollView,
  Linking, ActivityIndicator, Platform, KeyboardAvoidingView, Alert
} from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import { useFonts, DancingScript_700Bold } from '@expo-google-fonts/dancing-script';
import { Pacifico_400Regular } from '@expo-google-fonts/pacifico';

const API_KEY = 'sk-afri-13e1185b7e9d4409b4383864bbb15cdd'; // v2
const BASE = 'https://build.lewisnote.com';
const PROXY = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8081';

const TABS = [
  { key: 'discu', icon: '💬', color: '#4f8ef7' },
  { key: 'vocal', icon: '🎙️', color: '#a855f7' },
  { key: 'image', icon: '🏞️', color: '#f7924f' },
  { key: 'video', icon: '🎬', color: '#4fbb6a' },
];

const BG_EMOJIS = ['✨','🌟','💫','⭐','🌈','🎨','🚀','🎵','🌸','🍀','🦋','🌺','💎','🔥','🌊','🎭','🎪','🎠','🌙','☀️'];

const Background = () => (
  <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#16213e', overflow: 'hidden' }}>
    {BG_EMOJIS.map((emoji, i) => (
      <Text key={i} style={{ position: 'absolute', fontSize: 22, opacity: 0.12, top: `${(i * 37 + 5) % 95}%`, left: `${(i * 53 + 3) % 92}%` }}>{emoji}</Text>
    ))}
  </View>
);

const ImageCard = ({ url }) => (
  url ? <Image source={{ uri: url }} style={{ width: 220, height: 220, borderRadius: 18, borderWidth: 1, borderColor: '#ffffff20', marginTop: 10, alignSelf: 'flex-start' }} />
  : null
);

const VideoCard = ({ url }) => {
  const [videoUri, setVideoUri] = React.useState(null);
  const [error, setError] = React.useState(false);

  React.useEffect(() => {
    (async () => {
      try {
        if (Platform.OS === 'web') {
          const res = await fetch(url, { headers: { 'Authorization': `Bearer ${API_KEY}` } });
          const blob = await res.blob();
          setVideoUri(URL.createObjectURL(blob));
        } else {
          setVideoUri(url);
        }
      } catch { setError(true); }
    })();
  }, [url]);

  const player = useVideoPlayer(videoUri || '', p => { p.loop = false; });

  if (error) return (
    <View style={{ marginTop: 10, alignSelf: 'flex-start', backgroundColor: '#2d1f1f', borderRadius: 16, padding: 14, maxWidth: 260 }}>
      <Text style={{ color: '#e07070', fontWeight: '600' }}>⚠️ La vidéo n'est plus disponible.</Text>
      <TouchableOpacity onPress={() => Linking.openURL(url)} style={{ marginTop: 6 }}>
        <Text style={{ color: '#4fbb6a', fontSize: 13, textDecorationLine: 'underline' }}>Voir dans le navigateur →</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={{ marginTop: 10, alignSelf: 'flex-start', borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: '#333' }}>
      <VideoView player={player} style={{ width: 280, height: 158 }} allowsFullscreen allowsPictureInPicture onError={() => setError(true)} />
    </View>
  );
};

const ErrorCard = ({ msg }) => (
  <View style={{ marginTop: 10, alignSelf: 'flex-start', backgroundColor: '#2d1f1f', borderRadius: 16, padding: 12, maxWidth: 260 }}>
    <Text style={{ color: '#e07070', fontWeight: '600' }}>⚠️ {msg}</Text>
  </View>
);

// ---- ONGLET VOCAL ----
const VocalTab = () => {
  const [status, setStatus] = useState('idle');
  const [history, setHistory] = useState([]);
  const [seconds, setSeconds] = useState(0);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const mimeTypeRef = useRef('audio/webm');

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { sampleRate: 16000, channelCount: 1 } });
      const mimeType = MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' :
                       MediaRecorder.isTypeSupported('audio/ogg;codecs=opus') ? 'audio/ogg;codecs=opus' :
                       'audio/webm';
      console.log('Recording mimeType:', mimeType);
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      mediaRecorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mediaRecorder.start();
      mediaRecorderRef.current = mediaRecorder;
      mimeTypeRef.current = mimeType;
      setSeconds(0);
      setStatus('recording');
      timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000);
    } catch (e) {
      Alert.alert('Erreur', 'Impossible d\'accéder au micro.');
    }
  };

  const stopAndProcess = async () => {
    if (!mediaRecorderRef.current) return;
    clearInterval(timerRef.current);
    setStatus('processing');
    mediaRecorderRef.current.stop();
    mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());

    await new Promise(resolve => { mediaRecorderRef.current.onstop = resolve; });

    try {
      const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current });
      console.log('Blob size:', blob.size, 'type:', blob.type, 'PROXY:', PROXY);

      // 1. ASR via proxy Metro
      const asrRes = await fetch(`${PROXY}/api/transcribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream', 'X-Audio-Type': blob.type },
        body: blob,
      });
      const asrRaw = await asrRes.text();
      console.log('ASR raw:', asrRaw.slice(0, 300), 'status:', asrRes.status);
      let asrData = {};
      try { asrData = JSON.parse(asrRaw); } catch {}
      const text = asrData.text || asrData.transcript || '';
      if (!text.trim()) {
        setStatus('idle');
        Alert.alert('Rien compris', 'Je n\'ai pas compris. Parle plus fort et plus près du micro.');
        return;
      }

      // 2. IA
      const chatRes = await fetch(`${BASE}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'gpt-5.4', messages: [...history, { role: 'user', content: text }] }),
      });
      const chatData = await chatRes.json();
      const reply = chatData.choices?.[0]?.message?.content?.trim() || '';
      setHistory(h => [...h, { role: 'user', content: text }, { role: 'assistant', content: reply }]);

      // 3. TTS via proxy Metro
      setStatus('speaking');
      const ttsRes = await fetch(`${PROXY}/api/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: reply, voice: 'nova' }),
      });
      if (!ttsRes.ok) { setStatus('idle'); return; }
      const ttsBlob = await ttsRes.blob();
      const ttsUrl = URL.createObjectURL(ttsBlob);
      const audio = new window.Audio(ttsUrl);
      audio.onended = () => { setStatus('idle'); URL.revokeObjectURL(ttsUrl); };
      audio.onerror = () => { setStatus('idle'); URL.revokeObjectURL(ttsUrl); };
      audio.oncanplaythrough = () => audio.play();
      audio.load();
      // Fallback si onended ne se déclenche pas
      audio.addEventListener('pause', () => {
        if (audio.ended) { setStatus('idle'); URL.revokeObjectURL(ttsUrl); }
      });
      setTimeout(() => { if (status === 'speaking') setStatus('idle'); }, 60000);

    } catch (e) {
      console.log('Vocal error:', e?.message);
      setStatus('idle');
      Alert.alert('Erreur', 'Une erreur s\'est produite. Réessaie.');
    }
  };

  const isRecording = status === 'recording';
  const isProcessing = status === 'processing';
  const isSpeaking = status === 'speaking';

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
      {/* Historique */}
      {history.length > 0 && (
        <ScrollView style={{ width: '100%', maxHeight: 280, marginBottom: 20 }} showsVerticalScrollIndicator={false}>
          {history.map((h, i) => (
            <View key={i} style={{
              alignSelf: h.role === 'user' ? 'flex-end' : 'flex-start',
              backgroundColor: h.role === 'user' ? '#a855f733' : '#ffffff10',
              borderRadius: 16, padding: 10, paddingHorizontal: 14, marginBottom: 8, maxWidth: '85%',
              borderWidth: 1, borderColor: h.role === 'user' ? '#a855f755' : '#ffffff20',
            }}>
              <Text style={{ color: '#eee', fontSize: 14, lineHeight: 20 }}>{h.content}</Text>
            </View>
          ))}
        </ScrollView>
      )}

      {/* Status text */}
      <Text style={{ color: '#ffffff60', fontSize: 14, marginBottom: isRecording ? 8 : 24, textAlign: 'center', fontStyle: 'italic' }}>
        {status === 'idle' && (history.length === 0 ? 'Appuie pour parler à l\'IA 🎙️' : 'Continue la conversation...')}
        {status === 'recording' && '🔴 Enregistrement... Parle maintenant'}
        {status === 'processing' && '⚙️ Traitement en cours...'}
        {status === 'speaking' && '🔊 L\'IA répond...'}
      </Text>

      {isRecording && (
        <Text style={{ color: '#e05555', fontSize: 32, fontWeight: '700', marginBottom: 16, letterSpacing: 2 }}>
          {String(Math.floor(seconds / 60)).padStart(2, '0')}:{String(seconds % 60).padStart(2, '0')}
        </Text>
      )}

      {/* Bouton micro */}
      <TouchableOpacity
        onPress={isRecording ? stopAndProcess : startRecording}
        disabled={isProcessing || isSpeaking}
        style={{
          width: 90, height: 90, borderRadius: 45,
          backgroundColor: isRecording ? '#e05555' : isProcessing || isSpeaking ? '#ffffff20' : '#a855f7',
          justifyContent: 'center', alignItems: 'center',
          boxShadow: isRecording ? '0 0 20px #e05555' : '0 0 20px #a855f7', elevation: 10,
          borderWidth: 3,
          borderColor: isRecording ? '#ff8888' : '#a855f755',
        }}
      >
        {isProcessing || isSpeaking
          ? <ActivityIndicator size="large" color="#fff" />
          : <Text style={{ fontSize: 36 }}>{isRecording ? '⏹️' : '🎙️'}</Text>
        }
      </TouchableOpacity>

      {isRecording && (
        <Text style={{ color: '#e05555', marginTop: 12, fontSize: 13 }}>Appuie pour arrêter</Text>
      )}

      {/* Réinitialiser */}
      {history.length > 0 && status === 'idle' && (
        <TouchableOpacity onPress={() => setHistory([])} style={{ marginTop: 20 }}>
          <Text style={{ color: '#ffffff40', fontSize: 13 }}>🗑️ Nouvelle conversation</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

export default function App() {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('discu');
  const [msgList, setMsgList] = useState([]);
  const scrollViewRef = useRef(null);
  const [videoSeconds, setVideoSeconds] = useState(4);
  const videoGenerating = useRef(false);
  const [fontsLoaded] = useFonts({ DancingScript_700Bold, Pacifico_400Regular });

  const pushMsg = (item) => setMsgList(list => [...list, item]);
  const updateLastMsg = (update) => setMsgList(list => list.map((m, i) =>
    i === list.length - 1 ? { ...m, ...update } : m
  ));

  const handleTab = (key) => {
    setTab(key);
    setPrompt('');
    setMsgList([]);
    if (key !== 'video') setVideoSeconds(4);
  };

  const pollVideo = async (videoId) => {
    updateLastMsg({ result: 'Ta vidéo est en cours de création...', url: null, status: 'waiting' });
    for (let i = 0; i < 40; i++) {
      await new Promise(r => setTimeout(r, 5000));
      const pollRes = await fetch(`${BASE}/v1/videos/${videoId}`, { headers: { 'Authorization': `Bearer ${API_KEY}` } });
      const pollData = await pollRes.json();
      if (pollData.status === 'completed') {
        const contentRes = await fetch(`${BASE}/v1/videos/${videoId}/content`, { headers: { 'Authorization': `Bearer ${API_KEY}` } });
        const contentData = await contentRes.json();
        updateLastMsg(contentData.url
          ? { result: 'Vidéo prête !', url: contentData.url, status: 'done' }
          : { result: 'La vidéo est prête mais le lien est introuvable. Réessaie.', url: null, status: 'done' }
        );
        return;
      }
      if (pollData.error) {
        updateLastMsg({ result: 'La génération a échoué côté serveur. Réessaie dans quelques instants.', url: null, status: 'done' });
        return;
      }
    }
    updateLastMsg({ result: 'La génération prend trop de temps. Réessaie avec un prompt plus court.', url: null, status: 'done' });
  };

  const handleSend = async () => {
    if (!prompt.trim() || loading) return;
    if (tab === 'video' && videoGenerating.current) {
      Alert.alert('Vidéo en cours', 'Une génération est déjà en cours. Merci de patienter.');
      return;
    }

    setLoading(true);
    pushMsg({ type: tab, prompt, result: null, url: null, status: 'waiting', timestamp: Date.now() });
    setPrompt('');

    try {
      if (tab === 'discu') {
        const res = await fetch(`${BASE}/v1/chat/completions`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'gpt-5.4', messages: [...msgList.filter(m => m.type === 'discu').map(m => ({ role: 'user', content: m.prompt })), { role: 'user', content: prompt }] }),
        });
        const data = await res.json();
        updateLastMsg({ result: data.choices?.[0]?.message?.content?.trim() || 'Aucune réponse reçue. Réessaie.', status: 'done' });

      } else if (tab === 'image') {
        const res = await fetch(`${BASE}/v1/images/generations`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'gpt-image-1.5', prompt, size: '1024x1024', quality: 'low' }),
        });
        const data = await res.json();
        const url = data.url || data.data?.[0]?.url || null;
        updateLastMsg({ result: url ? 'Image générée' : "Aucune image générée. Réessaie.", url, status: 'done' });

      } else if (tab === 'video') {
        videoGenerating.current = true;
        const bodyObject = { prompt, seconds: videoSeconds };
        const res = await fetch(`${BASE}/v1/videos/generations`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(bodyObject),
        });
        const data = await res.json();

        if (data.id) {
          await pollVideo(data.id);
        } else {
          const msgErr = data.error?.message || '';
          if (msgErr.toLowerCase().includes('already have a video generation in progress')) {
            let retryData = null;
            for (let i = 1; i <= 6; i++) {
              updateLastMsg({ result: `Le serveur est occupé, nouvelle tentative dans 30s... (${i}/6)`, url: null, status: 'waiting' });
              await new Promise(r => setTimeout(r, 30000));
              const retryRes = await fetch(`${BASE}/v1/videos/generations`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(bodyObject),
              });
              retryData = await retryRes.json();
              if (retryData.id) break;
            }
            if (retryData?.id) {
              await pollVideo(retryData.id);
            } else {
              updateLastMsg({ result: 'Le serveur est toujours occupé. Attends quelques minutes puis réessaie.', url: null, status: 'done' });
            }
          } else {
            updateLastMsg({ result: 'La génération a échoué. Vérifie ta description et réessaie.', url: null, status: 'done' });
          }
        }
      }
    } catch (e) {
      updateLastMsg({ result: "Une erreur inattendue s'est produite. Vérifie ta connexion et réessaie.", url: null, status: 'done' });
    }
    videoGenerating.current = false;
    setLoading(false);
    setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
  };

  const activeColor = TABS.find(t => t.key === tab).color;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Background />

      {/* HEADER */}
      <View style={{ alignItems: 'center', marginTop: Platform.OS === 'ios' ? 36 : 18, marginBottom: 2 }}>
        <Text style={{
          fontSize: 32,
          fontFamily: fontsLoaded ? 'Pacifico_400Regular' : undefined,
          fontStyle: 'italic',
          color: '#fff',
          textShadow: '0 0 18px #4f8ef7',
        }}>BenTry</Text>
      </View>

      {/* TABS */}
      <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 4, gap: 10 }}>
        {TABS.map(({ key, icon, color }) => (
          <TouchableOpacity key={key} onPress={() => handleTab(key)} style={{
            width: 48, height: 48, borderRadius: 24,
            backgroundColor: tab === key ? color + '33' : '#ffffff10',
            borderWidth: tab === key ? 2 : 1,
            borderColor: tab === key ? color : '#ffffff20',
            justifyContent: 'center', alignItems: 'center',
          }}>
            <Text style={{ fontSize: tab === key ? 24 : 20 }}>{icon}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* DURÉE vidéo */}
      {tab === 'video' && (
        <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          {[4, 8, 12].map(val => (
            <TouchableOpacity key={val} onPress={() => setVideoSeconds(val)} style={{
              backgroundColor: videoSeconds === val ? '#4fbb6a' : '#ffffff15',
              paddingHorizontal: 14, paddingVertical: 5, borderRadius: 20,
              borderWidth: 1, borderColor: videoSeconds === val ? '#4fbb6a' : '#ffffff20',
            }}>
              <Text style={{ color: videoSeconds === val ? '#fff' : '#aaa', fontWeight: '700', fontSize: 13 }}>{val}s</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* ONGLET VOCAL */}
      {tab === 'vocal' ? <VocalTab /> : (
        <>
          {/* FIL DE MESSAGES */}
          <View style={{ flex: 1, marginHorizontal: 12, marginBottom: 8 }}>
            {msgList.filter(m => m.type === tab).length === 0 ? (
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <Text style={{ fontSize: 48, marginBottom: 12 }}>{TABS.find(t => t.key === tab).icon}</Text>
                <Text style={{ color: '#ffffff40', fontSize: 16, textAlign: 'center' }}>
                  {tab === 'discu' ? 'Pose ta question...' : tab === 'image' ? 'Décris une image à générer' : 'Décris une vidéo à créer'}
                </Text>
              </View>
            ) : (
              <ScrollView ref={scrollViewRef} showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingVertical: 12, paddingHorizontal: 4 }}
                onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}>
                {msgList.filter(m => m.type === tab).map((m, i) => (
                  <View key={i} style={{ marginBottom: 20 }}>
                    <View style={{ alignSelf: 'flex-end', backgroundColor: activeColor + '33', borderRadius: 18, borderBottomRightRadius: 4, maxWidth: '80%', padding: 11, paddingHorizontal: 14, borderWidth: 1, borderColor: activeColor + '55' }}>
                      <Text style={{ color: '#fff', fontSize: 15 }}>{m.prompt}</Text>
                    </View>

                    {m.status === 'waiting' && (
                      <View style={{ alignSelf: 'flex-start', marginTop: 10, backgroundColor: '#ffffff10', borderRadius: 18, borderBottomLeftRadius: 4, padding: 12, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center' }}>
                        <ActivityIndicator size="small" color={activeColor} style={{ marginRight: 10 }} />
                        <Text style={{ color: '#aaa', fontSize: 14, fontStyle: 'italic' }}>
                          {tab === 'discu' ? 'BenTry réfléchit...' : tab === 'image' ? 'Génération en cours...' : (m.result || 'Vidéo en cours de création...')}
                        </Text>
                      </View>
                    )}

                    {tab === 'discu' && m.status === 'done' && (
                      <View style={{ alignSelf: 'flex-start', marginTop: 10, backgroundColor: '#ffffff10', borderRadius: 18, borderBottomLeftRadius: 4, maxWidth: '85%', padding: 12, paddingHorizontal: 14 }}>
                        <Text style={{ color: '#eee', fontSize: 15, lineHeight: 22 }}>{m.result}</Text>
                      </View>
                    )}

                    {tab === 'image' && m.status === 'done' && m.url && <ImageCard url={m.url} />}
                    {tab === 'image' && m.status === 'done' && !m.url && <ErrorCard msg={m.result} />}
                    {tab === 'video' && m.status === 'done' && m.url && <VideoCard url={m.url} />}
                    {tab === 'video' && m.status === 'done' && !m.url && <ErrorCard msg={m.result} />}
                  </View>
                ))}
              </ScrollView>
            )}
          </View>

          {/* BARRE DE SAISIE */}
          <View style={{
            flexDirection: 'row', alignItems: 'flex-end',
            marginHorizontal: 12, marginBottom: Platform.OS === 'ios' ? 30 : 16,
            backgroundColor: '#ffffff12', borderRadius: 30, borderWidth: 1.5,
            borderColor: activeColor + '66', paddingVertical: 8, paddingLeft: 18, paddingRight: 8,
            boxShadow: `0 0 12px ${activeColor}4D`, elevation: 8,
          }}>
            <TextInput
              style={{ flex: 1, color: '#fff', fontSize: 16, maxHeight: 100, paddingVertical: 4, outlineStyle: 'none' }}
              placeholder={tab === 'discu' ? 'Écris ici...' : tab === 'image' ? 'Décris une image...' : 'Décris une vidéo...'}
              placeholderTextColor="#ffffff40"
              value={prompt}
              editable={!loading}
              onChangeText={setPrompt}
              multiline
              onSubmitEditing={handleSend}
              returnKeyType="send"
            />
            <TouchableOpacity onPress={handleSend} disabled={loading} style={{
              width: 44, height: 44, borderRadius: 22,
              backgroundColor: loading ? '#ffffff20' : activeColor,
              justifyContent: 'center', alignItems: 'center', marginLeft: 8,
              boxShadow: `0 0 8px ${activeColor}80`, elevation: 4,
            }}>
              {loading
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={{ fontSize: 20, color: '#fff' }}>➤</Text>
              }
            </TouchableOpacity>
          </View>
        </>
      )}
    </KeyboardAvoidingView>
  );
}
