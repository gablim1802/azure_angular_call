import { Injectable } from '@angular/core';
import {Component, OnInit} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { CallAutomationClient } from '@azure/communication-call-automation';
import {
  CallLocator,
  StartRecordingOptions,
  CallInvite,
  CreateCallOptions,
  parseCallAutomationEvent,
  CallAutomationEvent
} from "@azure/communication-call-automation";
import {
  AudioConfig,
  SpeechConfig,
  SpeechRecognizer,
  ResultReason,
  SpeechTranslationConfig, TranslationRecognizer
} from 'microsoft-cognitiveservices-speech-sdk';
import { AzureKeyCredential } from '@azure/core-auth'
import { CommunicationIdentityClient } from '@azure/communication-identity';
import { AzureLogger, setLogLevel } from "@azure/logger";
import { PhoneNumberIdentifier,AzureCommunicationTokenCredential } from "@azure/communication-common";
import { SubscriptionValidationEventData, AcsRecordingFileStatusUpdatedEventData } from "@azure/eventgrid";
import {
    CallClient,
    VideoStreamRenderer,
    LocalVideoStream,
    LocalAudioStream,
    Features,
    Call, DeviceManager, CallAgent, IncomingCall, RemoteParticipant, RemoteVideoStream
} from "@azure/communication-calling";
import {Subject} from "rxjs";
import {StateModel} from "../model/stateModel";

@Injectable({
  providedIn: 'root'
})
export class IfastCallServiceService {

  serviceCallId : string = '';
  incomingCallBoolean !: boolean;
  SPEECH_KEY : string = "0105a205441e42d2bb1f7ab3854ea578";
  SPEECH_REGION : string = "southeastasia";

  call !: Call;
  incomingCall !: Call;
  stateModel !:StateModel;
  currentLocalVideoStream !: LocalVideoStream;
  localVideoStreamRenderer !: VideoStreamRenderer;
  private stateModelSubject = new Subject<StateModel>();
  stateModel$ = this.stateModelSubject.asObservable();


  view !: any;
  renderer!: any;
  remoteVideoContainer!: any;
  remoteVideosGallery!: any;

  translationRecognizer!: any;

  minutes: number = 0;
  seconds: number = 0;
  timeInterval!: any;


  constructor() {
    this.stateModel = new StateModel()

  }


  startTimer(): void {
      this.minutes = 0 ;
      this.seconds = 0 ;
      this.timeInterval = setInterval(()=>{
          this.seconds++;
          if(this.seconds === 60){
              this.minutes++;
              this.seconds = 0;
          }
      },1000);
  }

  stopTimer() : void{
      clearInterval(this.timeInterval);
      console.log('Call duration:',this.minutes,this.seconds)
  }

  async startVideoCall(deviceManager : DeviceManager): Promise<void>{
    try{
      const localVideoStream = await this.createLocalVideoStream(deviceManager);
      console.log(localVideoStream,"this is videostream");

      if(this.incomingCallBoolean){
        console.log("incoming start video")
        await this.incomingCall.startVideo(localVideoStream);

      }
      else{
        console.log("caller start video")
        await this.call.startVideo(localVideoStream);

      }

    }catch (error) {
      console.error(error);
    }
  }

  async stopVideoCall(deviceManager : DeviceManager): Promise<void>{
    try{
      // await this.call.stopVideo(this.currentLocalVideoStream);
      if(this.incomingCallBoolean){
        console.log("incoming stop video")
        await this.incomingCall.stopVideo(this.currentLocalVideoStream);
      }
      else{
        console.log("caller stop video")
        await this.call.stopVideo(this.currentLocalVideoStream);
      }

    }catch (error){
      console.error(error);
    }
  }



  async startCall(deviceManager : DeviceManager, callAgent : CallAgent, calleeAcsUserId : string):  Promise<any> {
    try {
      const localVideoStream = await this.createLocalVideoStream(deviceManager);
      const localAudioStream = await this.createLocalAudioStream(deviceManager);
      const videoOptions = localVideoStream ? { localVideoStreams: [localVideoStream]} : undefined;
      const audioOptions = localAudioStream ? { muted: false, localAudioStreams: [localAudioStream]} : undefined;
      //
      // Assuming callAgent and calleeAcsUserId are properties of your component
      this.call = callAgent.startCall([{ communicationUserId: calleeAcsUserId.trim() }], { videoOptions, audioOptions });
      console.log(this.call)
      this.incomingCallBoolean = false;
      this.subscribeToCall(this.call);

      // console.log("abouve retunr this.stateModel")
      // return this.stateModel



    } catch (error) {
      console.error(error);
    }
  }

  async acceptIncomingCall(deviceManager : DeviceManager, incomingCall : IncomingCall): Promise<void> {
    try {
      const localVideoStream = await this.createLocalVideoStream(deviceManager);
      const videoOptions = localVideoStream ? { localVideoStreams: [localVideoStream] } : undefined;
      this.incomingCall = await incomingCall.accept({ videoOptions });
      this.incomingCallBoolean = true;
      // Subscribe to the call's properties and events.
      this.subscribeToCall(this.incomingCall);
    } catch (error) {
      console.error(error);
    }
  }

  async createLocalVideoStream(deviceManager : DeviceManager): Promise<any> {
    try {
      const cameras = await deviceManager.getCameras();
      const camera = cameras[0];
      if (camera) {
        return new LocalVideoStream(camera);
      } else {
        console.error(`No camera device found on the system`);
        return null; // Or handle this case accordingly
      }
    } catch (error) {
      console.error('Error while fetching cameras:', error);
      return null; // Or handle the error accordingly
    }
  }


  async createLocalAudioStream(deviceManager : DeviceManager): Promise<any> {
    try {
      const microphones = await deviceManager.getMicrophones();
      const audio = microphones[0];
      if (audio) {
        return new LocalAudioStream(audio);
      } else {
        console.error(`No audio device found on the system`);
        return null; // Or handle this case accordingly
      }
    } catch (error) {
      console.error('Error while fetching microphones:', error);
      return null; // Or handle the error accordingly
    }
  }

  async hangUp() : Promise<any> {
    if(this.incomingCallBoolean){
      await this.incomingCall.hangUp();
    }
    else{
      await this.call.hangUp();
    }


  }
  async mute() : Promise<any> {
    if(this.incomingCallBoolean){
      console.log("incoming mute")
      await this.incomingCall.mute();
      const isMicMuted = this.incomingCall.isMuted;
      console.log('incomming Microphone muted:', isMicMuted);
    }
    else{
      console.log("caller mute")
      await this.call.mute();
      const isMicMuted = this.call.isMuted;
      console.log('Microphone muted:', isMicMuted);
    }
  }
  async unmute() : Promise<any> {
    if(this.incomingCallBoolean){
      console.log("incoming unmute")

      await this.incomingCall.unmute();
      const isMicMuted = this.incomingCall.isMuted;
      console.log('incomming Microphone muted:', isMicMuted);

    }
    else{
      console.log("caller unmute")
      await this.call.unmute();
      const isMicMuted = this.call.isMuted;
      console.log('Microphone muted:', isMicMuted);
    }
  }




  subscribeToCall(call: any) {
    try {
      // Set initial button states


      // Your code for subscribing to call events
      call.on('idChanged', () => {
        // Handle 'idChanged' event
      });

      call.on('stateChanged', async () => {
        console.log(call.state, "call state")

        if (call.state === 'Connected') {
          await call.info.getServerCallId().then((result: any) => {
            this.stateModel.serverCallId = result;
            this.stateModel.connectedLabel = true;
            this.stateModel.acceptCallDisableBoolean = true;
            this.stateModel.startCallDisableBoolean = true;
            this.stateModel.hangUpCallDisableButton = false
            this.stateModel.muteCallDisableButton = false;

          });
          // Handle 'Connected' state
          this.startTimer();
        } else if (call.state === 'Disconnected') {
          this.stateModel.connectedLabel = false;
          this.stateModel.startCallDisableBoolean = false;
          this.stateModel.hangUpCallDisableButton = true;
          this.stateModel.muteCallDisableButton = true;
          // Modify button states here if needed


          this.stopTimer();
          this.translationRecognizer.stopContinuousRecognitionAsync();

        }

        this.stateModelSubject.next(this.stateModel);


      });


    call.on('remoteAudioStreamsUpdated',(e : any)=>{
      e.added.forEach(async(lvs : any)=>{
        console.log("yo");
        console.log(lvs);
        console.log(lvs.getMediaStream());
        const mediaStream = await lvs.getMediaStream();
        this.initializeSpeechToText(mediaStream);
      })});

    call.on('isLocalVideoStartedChanged', () => {
      });
    call.localVideoStreams.forEach(async (lvs : any) => {
      this.currentLocalVideoStream = lvs;
      console.log(this.currentLocalVideoStream,"this is current local video stream")
      await this.displayLocalVideoStream();
      this.stateModelSubject.next(this.stateModel);
    });
    call.on('localVideoStreamsUpdated', (e : any) => {
      console.log("localVideoStreamsUpdated")
      e.added.forEach(async (lvs : any) => {
        this.currentLocalVideoStream = lvs;
        await  this.displayLocalVideoStream();
        this.stateModelSubject.next(this.stateModel);
      });
      e.removed.forEach((lvs : any) => {
        this.removeLocalVideoStream();
      });
    });


    call.remoteParticipants.forEach((remoteParticipant : any) => {
      console.log(remoteParticipant,"remoteParticipant, call.on")
      this.subscribeToRemoteParticipant(remoteParticipant);
    });
      // Subscribe to the call's 'remoteParticipantsUpdated' event to be
      // notified when new participants are added to the call or removed from the call.
    call.on('remoteParticipantsUpdated', (e : any) => {
      // Subscribe to new remote participants that are added to the call.
      e.added.forEach((remoteParticipant : any) => {
        this.subscribeToRemoteParticipant(remoteParticipant)
      });
      // Unsubscribe from participants that are removed from the call
      e.removed.forEach((remoteParticipant : any) => {
      });
    });


    } catch (error) {
      console.error(error);

    }
  }


  subscribeToRemoteParticipant (remoteParticipant : RemoteParticipant)  {
    try {
      // Inspect the initial remoteParticipant.state value.
      // Subscribe to remoteParticipant's 'stateChanged' event for value changes.
      remoteParticipant.on('stateChanged', () => {
      });

      // Inspect the remoteParticipants's current videoStreams and subscribe to them.
      remoteParticipant.videoStreams.forEach(remoteVideoStream => {
        console.log(remoteVideoStream,"320line remoteVideoStream")

        this.subscribeToRemoteVideoStream(remoteVideoStream)
      });

      // Subscribe to the remoteParticipant's 'videoStreamsUpdated' event to be
      // notified when the remoteParticiapant adds new videoStreams and removes video streams.
      remoteParticipant.on('videoStreamsUpdated', e => {
        // Subscribe to new remote participant's video streams that were added.
        e.added.forEach(remoteVideoStream => {
          this.subscribeToRemoteVideoStream(remoteVideoStream)
        });
        // Unsubscribe from remote participant's video streams that were removed.
        e.removed.forEach(remoteVideoStream => {
        })
      });
    } catch (error) {
      console.error(error);
    }
  }

  async createView(){
    console.log('line 342 renderer',this.renderer)
    this.view = await this.renderer.createView();
    console.log(this.view,"view")
    this.stateModel.remoteViewTarget = this.view.target
    this.stateModelSubject.next(this.stateModel);
    // this.remoteVideoContainer.appendChild(this.view.target);
    // this.remoteVideosGallery.appendChild(this.remoteVideoContainer);
  }
  async subscribeToRemoteVideoStream  (remoteVideoStream:RemoteVideoStream) {
    console.log('in subscribeToRemote')
    // this.renderer = await new VideoStreamRenderer(remoteVideoStream);

    this.remoteVideoContainer = document.createElement('div');
    this.remoteVideoContainer.className = 'remote-video-container';

    let loadingSpinner = document.createElement('div');
    loadingSpinner.className = 'loading-spinner';

    console.log('356 line',this.remoteVideoContainer,this.renderer,"renderer")
    remoteVideoStream.on('isReceivingChanged', async() => {
      try {
        console.log(remoteVideoStream.isAvailable,"isavailable")
        if (remoteVideoStream.isAvailable) {
          console.log(remoteVideoStream.isReceiving,'isRceiving')
          const isReceiving = await remoteVideoStream.isReceiving;
          const isLoadingSpinnerActive = this.remoteVideoContainer.contains(loadingSpinner);
          if (!isReceiving && !isLoadingSpinnerActive) {
            this.remoteVideoContainer.appendChild(loadingSpinner);
          } else if (isReceiving && isLoadingSpinnerActive) {
            this.remoteVideoContainer.removeChild(loadingSpinner);
          }
          // mediaStream = await remoteVideoStream.getMediaStream();

          // initializeSpeechToText(mediaStream);
        }
      } catch (e) {
        console.error(e);
      }
    });


    remoteVideoStream.on('isAvailableChanged', async () => {
      try {
        if (remoteVideoStream.isAvailable) {
          console.log("line 382",remoteVideoStream)
          this.renderer = await new VideoStreamRenderer(remoteVideoStream);
          await this.createView();
        } else{
          this.view.dispose();
          this.stateModel.remoteViewTarget = this.view.target
          this.stateModelSubject.next(this.stateModel);
        }
      }
      catch (e) {
        console.error(e);
      }
    })


    if (remoteVideoStream.isAvailable) {
      try {
        await this.createView();
      }catch (e) {
        console.error(e);
      }
    }







  }





  async displayLocalVideoStream () {
    try {
      this.localVideoStreamRenderer = new VideoStreamRenderer(this.currentLocalVideoStream);
      const view = await this.localVideoStreamRenderer.createView();
      // const localVideoContainer = document.createElement('div');
      // // Modifying properties of the created element
      // localVideoContainer.hidden = false;
      // localVideoContainer.appendChild(view.target);
      console.log(view.target,"this is view target")
      this.stateModel.viewTarget = view.target

  } catch (error) {
    console.error(error);
  }
}

  async removeLocalVideoStream() {
    try {
      this.localVideoStreamRenderer.dispose();

      // Check if localVideoContainer exists and has a hidden property before setting it
      // if (this.stateModel.localVideoContainer && 'hidden' in this.stateModel.localVideoContainer) {
      //   this.stateModel.localVideoContainer.hidden = true;
      // }
    } catch (error) {
      console.error(error);
    }
  }



  initializeSpeechToText(mediaStream : MediaStream) {

    console.log("initializeSpeechToText");

    let speechTranslationConfig = SpeechTranslationConfig.fromSubscription(this.SPEECH_KEY, this.SPEECH_REGION);
    speechTranslationConfig.speechRecognitionLanguage = "en-US";
    speechTranslationConfig.addTargetLanguage("zh-CN");
    let audioConfig = AudioConfig.fromStreamInput(mediaStream);
    this.translationRecognizer = new TranslationRecognizer(speechTranslationConfig, audioConfig);

    // Create an audio context
    let audioContext = new AudioContext();
    //Create an audioSource from the mediaStream
    let audioSource = audioContext.createMediaStreamSource(mediaStream);
    //Initialise analyser for accessing the frequency data.
    let analyser = audioContext.createAnalyser();
    //Connect analyser to keep track of the state of audioSource
    audioSource.connect(analyser);


    // Adjust this threshold value as needed,(maybe need to be dynamic)
    const THRESHOLD = -30;


      this.translationRecognizer.recognized = (s:any, e:any) => {
      let bufferLength = analyser.frequencyBinCount;
      let dataArray = new Uint8Array(bufferLength);
      analyser.getByteFrequencyData(dataArray);

      let sum = 0;
      for(const amplitude of dataArray){
        sum+= amplitude * amplitude
      }

      const volumeLevel = Math.sqrt(sum / dataArray.length)


      console.log(bufferLength,'bufferLength')
      console.log(dataArray,'dataArray')
      console.log(volumeLevel,'volumeLevel');
      console.log(audioContext.getOutputTimestamp(),"timestamp")

      if (volumeLevel > THRESHOLD && volumeLevel != 0){

        if (e.result.reason == ResultReason.TranslatedSpeech) {
          console.log(`TRANSLATED: Text=${e.result.translations.get("zh-Hans")}`);

          let originalText = e.result.text;
          let translatedText = e.result.translations.get("zh-Hans");
          const currentTimer =  `${this.minutes.toString().padStart(2, '0')}:${this.seconds.toString().padStart(2, '0')}`

          let translatedData = {
              original: originalText,
              translated: translatedText,
              timestamp:currentTimer
          };

          this.stateModel.translatedData = translatedData;
          this.stateModelSubject.next(this.stateModel);


        } else if (e.result.reason == ResultReason.NoMatch) {
          console.log("NOMATCH: Speech could not be translated.");
            let translatedData = {
                original: '',
                translated: '',
            };

            this.stateModel.translatedData = translatedData;
            this.stateModelSubject.next(this.stateModel);
        }

      }else{
        // Below threshold, do something else or ignore translation
        console.log("Volume level below threshold");
      }


    };

      this.translationRecognizer.startContinuousRecognitionAsync();
  }

}
