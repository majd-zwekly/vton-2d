import { useEffect, useRef, useState } from 'react'
import {
  Camera,
  Check,
  CircleHelp,
  ImagePlus,
  LoaderCircle,
  Menu,
  Shirt,
  Sparkles,
  Upload,
  X,
} from 'lucide-react'
import { compressImageFile, createFittingJob, getCatalog, getJobResult, getJobStatus, getStockImage } from '../server'
import './VirtualFittingRoom.css'

function StockImage({ file }) {
  const [src, setSrc] = useState('')
  useEffect(() => {
    let url = ''
    let cancelled = false
    getStockImage(file)
      .then((objectUrl) => {
        url = objectUrl
        if (cancelled) URL.revokeObjectURL(objectUrl)
        else setSrc(objectUrl)
      })
      .catch(() => {})
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [file])
  return src ? <img src={src} alt="" /> : null
}

const shirts = [
  { id: 'classic', name: 'القميص الكلاسيكي', color: 'أسود', tone: 'black' },
  { id: 'scarlet', name: 'بلوزة سكارليت', color: 'أحمر', tone: 'red' },
  { id: 'cream', name: 'بلوزة كريمية', color: 'كريمي', tone: 'cream' },
]

async function dataUrlToFile(dataUrl, fileName) {
  const response = await fetch(dataUrl)
  const blob = await response.blob()
  return new File([blob], fileName, { type: blob.type || 'image/jpeg' })
}

function VirtualFittingRoom() {
  const [personImage, setPersonImage] = useState(null)
  const [shirtImage, setShirtImage] = useState(null)
  const [selectedShirt, setSelectedShirt] = useState(shirts[0].id)
  const [isCameraOpen, setIsCameraOpen] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [qualityMode, setQualityMode] = useState('fast')
  const [jobStep, setJobStep] = useState({ current: 0, total: 0 })
  const [jobStage, setJobStage] = useState('')
  const [notice, setNotice] = useState('')
  const [catalog, setCatalog] = useState([])
  const [resultImage, setResultImage] = useState(null)
  const personInput = useRef(null)
  const shirtInput = useRef(null)
  const video = useRef(null)
  const stream = useRef(null)

  useEffect(() => {
    getCatalog()
      .then((data) => {
        const garments = data.garments || []
        setCatalog(garments)
        if (garments[0]?.id) setSelectedShirt(garments[0].id)
      })
      .catch(() => setNotice('تعذر تحميل قطع الملابس من الخادم المحلي. يمكنك رفع صورة ملابس يدويًا.'))
  }, [])

  const translateStage = (stage) => {
    const known = {
      queued: 'في قائمة الانتظار...',
      'loading the model': 'جاري تحميل النموذج...',
      preprocess: 'جاري تحليل الصور...',
      sampling: 'جاري توليد الإطلالة...',
    }
    if (known[stage]) return known[stage]
    if (stage.startsWith('waiting for')) return 'بانتظار جهاز المعالجة...'
    return 'جاري تجهيز الإطلالة...'
  }

  const readImage = (file, setter) => {
    if (!file?.type.startsWith('image/')) {
      setNotice('يرجى اختيار ملف صورة صالح.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => setter({ src: reader.result, name: file.name })
    reader.readAsDataURL(file)
    setNotice('')
  }

  const openCamera = async () => {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setNotice('الكاميرا تحتاج تشغيل الموقع عبر http://localhost أو HTTPS، وليس فتح ملف مباشرة.')
      return
    }

    try {
      stream.current = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'user' } },
        audio: false,
      })
      setIsCameraOpen(true)
    } catch (error) {
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        setNotice('تم رفض صلاحية الكاميرا. اسمح بها من إعدادات الموقع ثم أعد المحاولة.')
      } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        setNotice('لم يتم العثور على كاميرا متصلة بهذا الجهاز.')
      } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
        setNotice('الكاميرا مستخدمة من تطبيق آخر. أغلقه ثم أعد المحاولة.')
      } else {
        setNotice('تعذر تشغيل الكاميرا. تأكد من اتصالها وصلاحيات المتصفح.')
      }
    }
  }

  useEffect(() => {
    if (isCameraOpen && video.current && stream.current) {
      video.current.srcObject = stream.current
    }
    return () => stream.current?.getTracks().forEach((track) => track.stop())
  }, [isCameraOpen])

  const closeCamera = () => {
    stream.current?.getTracks().forEach((track) => track.stop())
    stream.current = null
    setIsCameraOpen(false)
  }

  const capturePhoto = () => {
    const canvas = document.createElement('canvas')
    canvas.width = video.current.videoWidth
    canvas.height = video.current.videoHeight
    canvas.getContext('2d').drawImage(video.current, 0, 0)
    setPersonImage({ src: canvas.toDataURL('image/jpeg'), name: 'camera-capture.jpg' })
    closeCamera()
  }

  const handleDrop = (event) => {
    event.preventDefault()
    setIsDragging(false)
    readImage(event.dataTransfer.files[0], setPersonImage)
  }

  const tryFitting = async () => {
    setIsProcessing(true)
    setJobStep({ current: 0, total: qualityMode === 'fast' ? 15 : 30 })
    setJobStage('جاري إرسال الصور...')
    setNotice('')
    try {
      if (!personImage) throw new Error('أضف صورة الشخص أولًا.')
      const selected = catalog.find((item) => item.id === selectedShirt)
      const category = shirtImage ? 'tops' : (selected?.category || 'tops')
      const garmentType = shirtImage
        ? 'flat-lay'
        : (selected?.garment_type || selected?.type || 'flat-lay')
      const personFile = await compressImageFile(
        await dataUrlToFile(personImage?.src, personImage?.name || 'person.jpg'),
        { maxDimension: 1600, quality: 0.8 },
      )
      const garmentFile = shirtImage
        ? await compressImageFile(
          await dataUrlToFile(shirtImage.src, shirtImage.name),
          { maxDimension: 1200, quality: 0.82 },
        )
        : undefined
      const job = await createFittingJob({
        personFile,
        garmentId: shirtImage ? undefined : selected?.id,
        garmentFile,
        category,
        garmentType,
        mode: qualityMode,
      })
      const jobId = job.id || job.job_id
      if (!jobId) throw new Error('الخادم لم يُرجع رقم العملية.')
      setJobStage('تم استلام الطلب، بدأت المعالجة...')
      let status = await getJobStatus(jobId)
      while (!['done', 'completed', 'error', 'failed'].includes(status.status)) {
        const currentStep = Number(status.step_current ?? status.current_step ?? status.step ?? status.steps_done)
        const totalSteps = Number(status.step_total ?? status.total ?? status.total_steps ?? status.steps)
        if (Number.isFinite(currentStep)) {
          setJobStep((previous) => ({
            current: currentStep,
            total: Number.isFinite(totalSteps) && totalSteps > 0 ? totalSteps : previous.total,
          }))
        }
        if (status.stage) {
          setJobStage(translateStage(status.stage))
        } else if (status.status) {
          setJobStage(status.status === 'queued' ? 'في قائمة الانتظار...' : 'جاري تجهيز الإطلالة...')
        }
        await new Promise((resolve) => window.setTimeout(resolve, 500))
        status = await getJobStatus(jobId)
      }
      if (['error', 'failed'].includes(status.status)) throw new Error(status.error || 'فشلت عملية تجربة الملابس.')
      setJobStage('اكتملت المعالجة، جاري تحميل النتيجة...')
      const blob = await getJobResult(jobId)
      setResultImage(URL.createObjectURL(blob))
      setJobStep((previous) => ({ current: previous.total || previous.current, total: previous.total }))
      setJobStage('اكتملت التجربة بنجاح')
      setNotice('تم تجهيز إطلالتك بنجاح.')
    } catch (error) {
      setNotice(error.message || 'تعذر تنفيذ تجربة الملابس.')
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <main className="fitting-page" dir="rtl">
      <header className="fitting-header">
        <a className="brand" href="/" aria-label="الرئيسية">
          <span className="brand-mark"><Shirt size={21} /></span>
          <span>مقاسك</span>
        </a>
        <nav className="desktop-nav" aria-label="التنقل الرئيسي">
          <a className="active" href="#fitting">غرفة القياس</a>
          <a href="#collection">المجموعة</a>
        </nav>
        <div className="header-actions">
          <button className="help-button" type="button" aria-label="المساعدة"><CircleHelp size={20} /></button>
          <button className="mobile-menu" type="button" aria-label="القائمة"><Menu size={22} /></button>
        </div>
      </header>

      <section className="fitting-hero" id="fitting">
        <div className="hero-copy">
          <span className="eyebrow"><Sparkles size={15} /> جرّب قبل أن تشتري</span>
          <h1>إطلالتك الجديدة<br /><em>تبدأ من هنا.</em></h1>
          <p>ارفع صورتك واختر القطعة التي تحبها، ودع تقنيتنا تمنحك تصورًا واقعيًا لإطلالتك خلال ثوانٍ.</p>
          <div className="hero-points">
            <span><Check size={15} /> خصوصيتك أولًا</span>
            <span><Check size={15} /> نتائج واقعية</span>
          </div>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="art-ring ring-one" /><div className="art-ring ring-two" />
          <div className="art-card art-card-top">تصميم يناسبك <Sparkles size={14} /></div>
          <div className="art-person"><div className="person-head" /><div className="person-body" /></div>
          <div className="art-card art-card-bottom"><span className="mini-check"><Check size={12} /></span> تجربة ذكية</div>
        </div>
      </section>

      <section className="workspace" id="collection">
        <div className="workspace-heading">
          <div><span className="section-label">01 / ابدأ تجربتك</span><h2>أضف صورتك واختر إطلالتك</h2></div>
          <span className="secure-note"><Check size={15} /> بياناتك آمنة ولا يتم حفظها</span>
        </div>
        <div className="workspace-grid">
          <div className="panel">
            <div className="panel-title"><span className="step-number">01</span><div><h3>صورتك</h3><p>اختر صورة واضحة لك من الأمام</p></div></div>
            <div
              className={`drop-zone ${isDragging ? 'dragging' : ''} ${personImage ? 'has-image' : ''}`}
              onDragOver={(event) => { event.preventDefault(); setIsDragging(true) }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => personInput.current?.click()}
            >
              {personImage ? <img src={personImage.src} alt="صورتك" /> : <><span className="upload-icon"><Upload size={24} /></span><strong>اسحب صورتك هنا</strong><span>أو اضغط للاختيار من جهازك</span><small>PNG أو JPG · حتى 10MB</small></>}
            </div>
            <input ref={personInput} type="file" accept="image/*" hidden onChange={(event) => readImage(event.target.files[0], setPersonImage)} />
            <button className="camera-button" type="button" onClick={openCamera}><Camera size={18} /> التقط صورة بالكاميرا</button>
          </div>

          <div className="panel">
            <div className="panel-title"><span className="step-number">02</span><div><h3>القطعة</h3><p>اختر من مجموعتنا أو ارفع قطعة خاصة</p></div></div>
            <div className="shirt-options">
              {(catalog.length ? catalog : shirts).map((shirt) => <button key={shirt.id} type="button" className={`shirt-option ${selectedShirt === shirt.id ? 'selected' : ''}`} onClick={() => { setSelectedShirt(shirt.id); setShirtImage(null) }}><span className={`shirt-preview ${shirt.tone || 'black'}`}>{shirt.file ? <StockImage file={shirt.file} /> : <Shirt size={34} />}</span><span><strong>{shirt.title || shirt.name}</strong><small>{shirt.category || shirt.color}</small></span>{selectedShirt === shirt.id && <Check className="option-check" size={17} />}</button>)}
            </div>
            <button className="upload-shirt" type="button" onClick={() => shirtInput.current?.click()}><ImagePlus size={18} /> رفع صورة بلوزة خاصة</button>
            <input ref={shirtInput} type="file" accept="image/*" hidden onChange={(event) => readImage(event.target.files[0], setShirtImage)} />
            {shirtImage && <div className="file-name"><Check size={14} /> {shirtImage.name}</div>}
          </div>
        </div>
        <div className="quality-selector" role="group" aria-label="اختيار جودة المعالجة">
          <span className="quality-label">طريقة المعالجة</span>
          <button type="button" className={qualityMode === 'fast' ? 'selected' : ''} onClick={() => setQualityMode('fast')} disabled={isProcessing}>
            <strong>Fast</strong><small>15 خطوة · أسرع</small>
          </button>
          <button type="button" className={qualityMode === 'quality' ? 'selected' : ''} onClick={() => setQualityMode('quality')} disabled={isProcessing}>
            <strong>Quality</strong><small>30 خطوة · جودة أعلى</small>
          </button>
        </div>
        <button className="fit-button" type="button" onClick={tryFitting} disabled={isProcessing}>{isProcessing ? <LoaderCircle className="spin" size={20} /> : <Sparkles size={20} />} {isProcessing ? 'جارٍ تجهيز المعاينة...' : 'شاهد إطلالتك'}</button>
        {isProcessing && <div className="job-progress" role="status" aria-live="polite">
          <div className="progress-heading"><span>{jobStage}</span><strong>الخطوة {jobStep.current} من {jobStep.total || '...'}</strong></div>
        </div>}
        {notice && <p className="notice" role="status">{notice}</p>}
        {resultImage && <div className="result-preview"><h3>نتيجة التجربة</h3><img src={resultImage} alt="نتيجة تجربة الملابس" /></div>}
      </section>

      <footer className="fitting-footer"><span>© 2024 مقاسك</span><span>تجربة أزياء أكثر ذكاءً</span></footer>

      {isCameraOpen && <div className="camera-modal" role="dialog" aria-modal="true" aria-label="التقاط صورة"><div className="camera-box"><button className="close-camera" type="button" onClick={closeCamera} aria-label="إغلاق"><X size={20} /></button><video ref={video} autoPlay playsInline /><div className="camera-controls"><button type="button" onClick={capturePhoto}><Camera size={22} /> التقاط الصورة</button></div></div></div>}
    </main>
  )
}

export default VirtualFittingRoom
