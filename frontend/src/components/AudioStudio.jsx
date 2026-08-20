import React, { useState, useEffect, useRef } from 'react';
import { 
  Mic, Square, Play, Pause, Upload, Trash2, FileText, 
  Clock, CheckCircle, AlertCircle, RefreshCw,
  Sparkles, CheckSquare, ListOrdered,
  Radio
} from 'lucide-react';
import { 
  getAudioRecords, uploadAudio, processAudio, 
  convertAudioToNote, deleteAudioRecord 
} from '../api/client';
import { notify } from '../utils/notify';

export default function AudioStudio({ onNoteCreated }) {
  const [records, setRecords] = useState([]);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [volumeLevel, setVolumeLevel] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccessTip, setUploadSuccessTip] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1.0);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const animFrameRef = useRef(null);
  const audioPlayerRef = useRef(null);
  const fileInputRef = useRef(null);

  // 加载录音列表
  const loadRecords = async () => {
    try {
      const data = await getAudioRecords();
      const safeData = Array.isArray(data) ? data : [];
      setRecords(safeData);
      if (safeData.length > 0 && !selectedRecord) {
        setSelectedRecord(safeData[0]);
      }
    } catch (err) {
      console.error('Failed to load audio records:', err);
    }
  };

  useEffect(() => {
    loadRecords();
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (audioContextRef.current) audioContextRef.current.close();
    };
  }, []);

  // 录音计时器
  useEffect(() => {
    if (isRecording) {
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } else {
      clearInterval(timerRef.current);
      setRecordingTime(0);
    }
    return () => clearInterval(timerRef.current);
  }, [isRecording]);

  // 开始本地录音 (带实时音量可视化与可靠 timeslice 收集)
  const startRecording = async () => {
    try {
      const hasMediaDevices = typeof navigator !== 'undefined' && navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function';
      
      let stream = null;
      if (hasMediaDevices) {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } else if (navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia) {
        const legacyGetMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia;
        stream = await new Promise((resolve, reject) => legacyGetMedia.call(navigator, { audio: true }, resolve, reject));
      } else {
        alert('当前系统环境尚未开启原生麦克风通道，请使用下方的「选择本地音频文件」直接上传录音（支持 mp3, m4a, wav, aac 格式）！');
        return;
      }

      if (!stream) {
        alert('未能获取到麦克风音频流');
        return;
      }

      // 实时音频音量分析器 (用来反馈给用户麦克风正在正常拾音)
      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) {
          const audioCtx = new AudioContext();
          audioContextRef.current = audioCtx;
          const source = audioCtx.createMediaStreamSource(stream);
          const analyser = audioCtx.createAnalyser();
          analyser.fftSize = 256;
          source.connect(analyser);
          analyserRef.current = analyser;

          const dataArray = new Uint8Array(analyser.frequencyBinCount);
          const updateVolume = () => {
            if (analyserRef.current) {
              analyserRef.current.getByteFrequencyData(dataArray);
              let sum = 0;
              for (let i = 0; i < dataArray.length; i++) {
                sum += dataArray[i];
              }
              const avg = sum / dataArray.length;
              setVolumeLevel(Math.min(100, Math.round((avg / 128) * 100)));
              animFrameRef.current = requestAnimationFrame(updateVolume);
            }
          };
          updateVolume();
        }
      } catch (e) {
        console.warn('AudioContext not available for visualization', e);
      }

      let mimeType = '';
      if (typeof MediaRecorder !== 'undefined') {
        if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) mimeType = 'audio/webm;codecs=opus';
        else if (MediaRecorder.isTypeSupported('audio/webm')) mimeType = 'audio/webm';
        else if (MediaRecorder.isTypeSupported('audio/mp4')) mimeType = 'audio/mp4';
      }

      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
        if (audioContextRef.current) {
          audioContextRef.current.close().catch(() => {});
          audioContextRef.current = null;
        }
        setVolumeLevel(0);

        // 等待最后一帧切片数据到达
        await new Promise(r => setTimeout(r, 200));

        const totalBytes = audioChunksRef.current.reduce((acc, chunk) => acc + chunk.size, 0);
        if (totalBytes === 0) {
          alert('未能采集到有效音频数据，请确认麦克风是否正常输入。');
          return;
        }

        const actualMime = mimeType || recorder.mimeType || 'audio/webm';
        const ext = actualMime.includes('mp4') ? 'mp4' : 'webm';
        const audioBlob = new Blob(audioChunksRef.current, { type: actualMime });
        const nowStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const file = new File([audioBlob], `本地录音_${nowStr}.${ext}`, { type: actualMime });

        await handleUploadFile(file);
        stream.getTracks().forEach(track => track.stop());
      };

      // 每 250ms 切片产生一次数据，确保数据实时写入
      recorder.start(250);
      setIsRecording(true);
    } catch (err) {
      alert('无法访问麦克风: ' + err.message + '\n\n💡 提示：您可以使用下方的「选择本地音频文件」直接上传已有录音！');
    }
  };

  // 停止录音
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      try {
        mediaRecorderRef.current.stop();
      } catch (e) {
        console.error(e);
      }
      setIsRecording(false);
    }
  };

  // 上传文件并处理
  const handleUploadFile = async (file) => {
    if (!file) return;
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('auto_process', 'true');
      
      const newRecord = await uploadAudio(formData);
      await loadRecords();
      setSelectedRecord(newRecord);

      setUploadSuccessTip(`✅ 录音文件「${file.name}」已成功保存并同步到本地 ./data/uploads/audio/！`);
      setTimeout(() => setUploadSuccessTip(''), 4000);
    } catch (err) {
      alert('上传并保存录音失败: ' + (err.response?.data?.detail || err.message));
    } finally {
      setIsUploading(false);
    }
  };

  // 重新触发分析
  const handleReprocess = async (id) => {
    try {
      const updated = await processAudio(id);
      setSelectedRecord(updated);
      await loadRecords();
      notify('录音分析完成', updated.file_name || '已生成转写与纪要');
    } catch (err) {
      alert('分析失败: ' + (err.response?.data?.detail || err.message));
    }
  };

  // 转化为正式笔记
  const handleConvertToNote = async (id) => {
    try {
      const res = await convertAudioToNote(id);
      alert('🎉 成功将录音与 AI 纪要转化为新笔记！');
      if (onNoteCreated) {
        onNoteCreated(res.note_id);
      }
    } catch (err) {
      alert('转化失败: ' + (err.response?.data?.detail || err.message));
    }
  };

  // 删除录音
  const handleDelete = async (id) => {
    if (!window.confirm('确定要删除这条录音文件与分析记录吗？物理文件也将被安全移除。')) return;
    try {
      await deleteAudioRecord(id);
      if (selectedRecord?.id === id) {
        setSelectedRecord(null);
      }
      await loadRecords();
    } catch (err) {
      alert('删除失败: ' + (err.response?.data?.detail || err.message));
    }
  };

  // 格式化时间
  const formatTime = (seconds) => {
    if (isNaN(seconds)) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const togglePlay = () => {
    if (!audioPlayerRef.current) return;
    if (isPlaying) {
      audioPlayerRef.current.pause();
      setIsPlaying(false);
    } else {
      audioPlayerRef.current.play();
      setIsPlaying(true);
    }
  };

  const seekTo = (seconds) => {
    if (!audioPlayerRef.current) return;
    audioPlayerRef.current.currentTime = seconds;
    audioPlayerRef.current.play();
    setIsPlaying(true);
  };

  const handleRateChange = (rate) => {
    setPlaybackRate(rate);
    if (audioPlayerRef.current) {
      audioPlayerRef.current.playbackRate = rate;
    }
  };

  let minutesData = {};
  try {
    minutesData = selectedRecord?.ai_summary ? JSON.parse(selectedRecord.ai_summary) : {};
  } catch {
    minutesData = {};
  }

  return (
    <div className="flex-1 bg-gray-50 dark:bg-gray-900 flex h-screen overflow-hidden">
      {/* 左侧：录音列表与控制面板 */}
      <div className="w-80 border-r border-mac-border dark:border-mac-borderDark bg-white dark:bg-gray-800 flex flex-col shrink-0">
        {/* 顶部录音/上传操作区 */}
        <div className="p-4 border-b border-mac-border dark:border-mac-borderDark space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-800 dark:text-gray-200 flex items-center space-x-1.5">
              <Mic className="w-4 h-4 text-purple-500" />
              <span>语音录音工坊</span>
            </h2>
            <span className="text-xs text-gray-400 font-mono">{records.length} 条</span>
          </div>

          {/* 实时录音按钮 */}
          {!isRecording ? (
            <button
              onClick={startRecording}
              className="w-full py-2.5 bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 active:scale-98 text-white rounded-lg text-xs font-semibold flex items-center justify-center space-x-2 shadow-sm transition-all"
            >
              <Mic className="w-4 h-4" />
              <span>点击开始麦克风录音</span>
            </button>
          ) : (
            <div className="space-y-2">
              <button
                onClick={stopRecording}
                className="w-full py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-lg text-xs font-semibold flex items-center justify-center space-x-2 shadow-sm animate-pulse"
              >
                <Square className="w-4 h-4 fill-white" />
                <span>正在录音... {formatTime(recordingTime)} (点击停止并保存)</span>
              </button>
              
              {/* 实时拾音频谱跳动指示 */}
              <div className="flex items-center space-x-2 px-2">
                <span className="text-[10px] text-gray-400 font-mono">拾音</span>
                <div className="flex-1 bg-gray-200 dark:bg-gray-700 h-1.5 rounded-full overflow-hidden">
                  <div 
                    className="bg-green-500 h-full transition-all duration-75"
                    style={{ width: `${Math.max(volumeLevel, 5)}%` }}
                  />
                </div>
                <span className="text-[10px] text-green-500 font-mono font-bold">{volumeLevel}%</span>
              </div>
            </div>
          )}

          {/* 上传本地已有音频 */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={(e) => handleUploadFile(e.target.files[0])}
            accept="audio/*"
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="w-full py-2 bg-gray-100 dark:bg-gray-700/60 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-xs font-medium flex items-center justify-center space-x-1.5 border border-dashed border-gray-300 dark:border-gray-600 transition"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>{isUploading ? '正在上传并保存...' : '拖拽或选择本地音频文件'}</span>
          </button>
        </div>

        {/* 提示条 */}
        {uploadSuccessTip && (
          <div className="p-2.5 bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300 text-[11px] border-b border-green-200 dark:border-green-800 animate-fadeIn">
            {uploadSuccessTip}
          </div>
        )}

        {/* 录音历史列表 */}
        <div className="flex-1 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700/50">
          {records.length === 0 ? (
            <div className="p-8 text-center text-xs text-gray-400 space-y-2">
              <Radio className="w-8 h-8 mx-auto opacity-30 text-purple-500" />
              <p>暂无本地录音文件</p>
              <p className="text-[10px] text-gray-400">点击上方大按钮开始录音，所有录音将 100% 物理保存在您的本地磁盘</p>
            </div>
          ) : (
            records.map((r) => {
              const isSel = selectedRecord?.id === r.id;
              return (
                <div
                  key={r.id}
                  onClick={() => setSelectedRecord(r)}
                  className={`p-3 cursor-pointer transition flex items-center justify-between group ${
                    isSel ? 'bg-purple-50 dark:bg-purple-950/40 border-l-4 border-purple-500' : 'hover:bg-gray-50 dark:hover:bg-gray-700/40'
                  }`}
                >
                  <div className="space-y-1 flex-1 min-w-0 pr-2">
                    <h4 className="text-xs font-semibold text-gray-800 dark:text-gray-200 truncate">
                      {r.file_name || r.filename}
                    </h4>
                    <div className="flex items-center space-x-2 text-[10px] text-gray-400 font-mono">
                      <span>{formatTime(r.duration || r.duration_seconds || 0)}</span>
                      <span>•</span>
                      <span>{new Date(r.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  </div>

                  <div className="flex items-center space-x-1">
                    {r.status === 'completed' && <CheckCircle className="w-3.5 h-3.5 text-green-500" />}
                    {r.status === 'processing' && <RefreshCw className="w-3.5 h-3.5 text-blue-500 animate-spin" />}
                    {r.status === 'failed' && <AlertCircle className="w-3.5 h-3.5 text-red-500" />}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(r.id);
                      }}
                      className="p-1 text-gray-400 hover:text-red-500 rounded opacity-0 group-hover:opacity-100 transition"
                      title="删除物理文件与记录"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* 底部物理目录说明 */}
        <div className="p-2.5 border-t border-mac-border dark:border-mac-borderDark text-[10px] text-gray-400 dark:text-gray-500 bg-gray-50/50 dark:bg-gray-800/20 truncate">
          📁 本地磁盘存档: <span className="font-mono text-gray-600 dark:text-gray-300">./data/uploads/audio/</span>
        </div>
      </div>

      {/* 右侧：播放器与 AI 提取详情 */}
      {selectedRecord ? (
        <div className="flex-1 flex flex-col h-screen overflow-hidden bg-white dark:bg-gray-900">
          {/* 播放器工具栏 */}
          <div className="p-4 border-b border-mac-border dark:border-mac-borderDark bg-gray-50/50 dark:bg-gray-800/40 flex items-center justify-between shrink-0">
            <div className="flex items-center space-x-3">
              <button
                onClick={togglePlay}
                className="w-10 h-10 rounded-full bg-purple-500 hover:bg-purple-600 active:scale-95 text-white flex items-center justify-center shadow-md transition"
              >
                {isPlaying ? <Pause className="w-5 h-5 fill-white" /> : <Play className="w-5 h-5 fill-white ml-0.5" />}
              </button>
              <div>
                <h3 className="text-sm font-bold text-gray-800 dark:text-gray-100">{selectedRecord.file_name || selectedRecord.filename}</h3>
                <div className="text-xs text-gray-400 font-mono">
                  {formatTime(currentTime)} / {formatTime(duration || selectedRecord.duration || selectedRecord.duration_seconds || 0)}
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              {/* 倍速控制 */}
              <div className="flex items-center space-x-1 bg-gray-200 dark:bg-gray-700 rounded-lg p-0.5 text-[11px] font-mono font-medium">
                {[1.0, 1.25, 1.5, 2.0].map((rate) => (
                  <button
                    key={rate}
                    onClick={() => handleRateChange(rate)}
                    className={`px-1.5 py-0.5 rounded ${playbackRate === rate ? 'bg-white dark:bg-gray-900 text-purple-600 dark:text-purple-400 font-bold shadow-sm' : 'text-gray-600 dark:text-gray-300'}`}
                  >
                    {rate}x
                  </button>
                ))}
              </div>

              {/* 转为正式笔记按钮 */}
              <button
                onClick={() => handleConvertToNote(selectedRecord.id)}
                className="flex items-center space-x-1 px-3 py-1.5 bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white rounded-lg text-xs font-semibold shadow-sm transition"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>转为正式笔记</span>
              </button>
            </div>

            {/* 隐藏原生音频播放器 */}
            <audio
              ref={audioPlayerRef}
              src={selectedRecord.file_url || `/api/uploads/audio/${selectedRecord.file_path?.split('/').pop()}`}
              onTimeUpdate={() => setCurrentTime(audioPlayerRef.current?.currentTime || 0)}
              onLoadedMetadata={() => setDuration(audioPlayerRef.current?.duration || 0)}
              onEnded={() => setIsPlaying(false)}
            />
          </div>

          {/* 内容区：左右分栏展示逐字稿与 AI 纪要 */}
          <div className="flex-1 flex overflow-hidden divide-x divide-mac-border dark:divide-mac-borderDark">
            {/* 左半区：逐字稿 */}
            <div className="w-1/2 p-6 overflow-y-auto space-y-4">
              <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center space-x-1.5">
                <Clock className="w-3.5 h-3.5 text-purple-500" />
                <span>逐字稿记录 (点击可跳转播放)</span>
              </h4>

              {selectedRecord.transcription_segments && selectedRecord.transcription_segments.length > 0 ? (
                <div className="space-y-3">
                  {selectedRecord.transcription_segments.map((seg, idx) => (
                    <div
                      key={idx}
                      onClick={() => seekTo(seg.start)}
                      className="p-2.5 rounded-lg bg-gray-50 dark:bg-gray-800/60 hover:bg-purple-50 dark:hover:bg-purple-950/30 cursor-pointer transition text-xs space-y-1"
                    >
                      <span className="text-[10px] font-mono text-purple-500 font-semibold">
                        [{formatTime(seg.start)} - {formatTime(seg.end)}]
                      </span>
                      <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
                        {seg.text}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">
                  {selectedRecord.transcription || selectedRecord.transcript_text || '录音已保存在本地物理磁盘中。若配置了 AI/Whisper 服务，将自动提取逐字稿。'}
                </p>
              )}
            </div>

            {/* 右半区：AI 智能纪要提炼 */}
            <div className="w-1/2 p-6 overflow-y-auto space-y-5 bg-gray-50/30 dark:bg-gray-900/30">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center space-x-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                  <span>AI 智能会议纪要</span>
                </h4>
                <button
                  onClick={() => handleReprocess(selectedRecord.id)}
                  className="text-xs text-purple-500 hover:text-purple-600 flex items-center space-x-1"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>重新提炼</span>
                </button>
              </div>

              {minutesData.summary && (
                <div className="p-4 rounded-xl bg-purple-50 dark:bg-purple-950/40 border border-purple-100 dark:border-purple-900/50 space-y-1.5">
                  <h5 className="text-xs font-bold text-purple-700 dark:text-purple-300">💡 核心结论与要点</h5>
                  <p className="text-xs text-purple-900 dark:text-purple-200 leading-relaxed">
                    {minutesData.summary}
                  </p>
                </div>
              )}

              {minutesData.key_points && minutesData.key_points.length > 0 && (
                <div className="space-y-2">
                  <h5 className="text-xs font-bold text-gray-700 dark:text-gray-300 flex items-center space-x-1">
                    <ListOrdered className="w-3.5 h-3.5 text-blue-500" />
                    <span>核心议题与讨论</span>
                  </h5>
                  <ul className="space-y-1.5 text-xs text-gray-600 dark:text-gray-400 list-disc list-inside">
                    {minutesData.key_points.map((kp, idx) => (
                      <li key={idx} className="leading-relaxed">{kp}</li>
                    ))}
                  </ul>
                </div>
              )}

              {minutesData.action_items && minutesData.action_items.length > 0 && (
                <div className="space-y-2">
                  <h5 className="text-xs font-bold text-gray-700 dark:text-gray-300 flex items-center space-x-1">
                    <CheckSquare className="w-3.5 h-3.5 text-emerald-500" />
                    <span>行动待办清单 (Action Items)</span>
                  </h5>
                  <div className="space-y-1.5">
                    {minutesData.action_items.map((item, idx) => (
                      <div key={idx} className="p-2 rounded-lg bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/50 text-xs text-emerald-800 dark:text-emerald-300 flex items-center space-x-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
          <p className="text-xs">请从左侧选择一条录音查看分析，或点击开始录音</p>
        </div>
      )}
    </div>
  );
}
