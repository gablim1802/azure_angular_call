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
import { AudioConfig, SpeechConfig, SpeechRecognizer, ResultReason } from 'microsoft-cognitiveservices-speech-sdk';
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
  Call, CallAgent, PermissionConstraints, DeviceManager, IncomingCall
} from "@azure/communication-calling";
import {IfastCallServiceService} from "./ifast-call-service.service";
import {Subscription, timeInterval} from "rxjs";
import {StateModel} from "../model/stateModel";

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet,FormsModule ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit  {
  title = 'ifast_call';

  userAccessToken : string ='';
  calleeAcsUserId : string ='';
  calleeIdentityText : string ='';

  // Calling web sdk objects
   callAgent !: CallAgent ;
   deviceManager !: DeviceManager ;
   permissionConstraints: PermissionConstraints = { audio: true , video:true}
   call!: Call ;
   incomingCall!: IncomingCall ;
   localVideoStream: any ;
   localVideoStreamRenderer: any ;

//Speech To Text
   speechConfig: any ;
   audioConfig: any ;
   speechRecognizer: any ;
   originalText:  string ='';
   translatedText:  string ='';




// Usage of CallAutomationClient

  //Recording
  callRecordingApi: any ;
  serverCallId: any ;
  recordingId: any ;
  callAutomationClient: any ;

  connectedLabel?: boolean = false;
  //Buttons disable boolean
  // voice
  acceptCallDisableButton?: boolean  = true;
  startCallDisableButton ?: boolean   = false;
  hangUpCallDisableButton ?: boolean = true;
  pauseCallDisableButton ?: boolean  = true;
  downloadRecordButton ?: boolean  = true;
  muteCallDisableButton?: boolean  = true;
  unmuteCallDisableButton?: boolean  = true;

  //video
  startVideoDisableButton ?: boolean  = false;
  stopVideoDisableButton ?: boolean  = false;

  // localVideoContainer!: HTMLElement | null  ;

  newStateModel : any;



  constructor(private callService : IfastCallServiceService){}

  async ngOnInit(){
    const endpoint = "https://ifast-chat-communication-service.asiapacific.communication.azure.com/"
    const accessKey = "dESXIwSeyF5yqPqYlOCKMO/IAvYagWVnYy+4NRfq7ws/ePtUh7qlQwyo6mPnprQP6e8LUmViLNcixZX+PlLZdg=="
    const tokenCredential = new AzureKeyCredential(accessKey);
    const identityClient = new CommunicationIdentityClient(endpoint, tokenCredential);

    // Initialise automation client for recording.
    this.callAutomationClient = new CallAutomationClient(endpoint,tokenCredential);
    console.log(this.callAutomationClient,"clienttt");

    // Create an identity
    let identityResponse = await identityClient.createUser();
    console.log(`\nCreated an identity with ID: ${identityResponse.communicationUserId}`);
    this.calleeIdentityText = identityResponse.communicationUserId;
    // Issue an access token with a validity of 24 hours and the "voip" scope for an identity
    let tokenResponse = await identityClient.getToken(identityResponse, ["voip"]);
    let { token, expiresOn } = tokenResponse;
    console.log(`\nIssued an access token with 'voip' scope that expires at ${expiresOn}:`);
    console.log(token);

    this.userAccessToken=token;

    this.initializeCallAgent();


  }


  async initializeCallAgent(): Promise<void> {
    console.log('initializeCallAgent');
    try {
      const callClient = new CallClient();
      const tokenCredential = new AzureCommunicationTokenCredential(this.userAccessToken.trim());
      this.callAgent = await callClient.createCallAgent(tokenCredential);

      // Set up camera and audio device permissions
      this.deviceManager = await callClient.getDeviceManager();
      await this.deviceManager.askDevicePermission(this.permissionConstraints);
      // await this.deviceManager.askDevicePermission({ audio: true });

      // Listen for an incoming call to accept
      this.callAgent.on('incomingCall', async (args:any) => {
        try {
          this.incomingCall = args.incomingCall;
          this.acceptCallDisableButton = false;
          this.startCallDisableButton = true;
        } catch (error) {
          console.error(error);
        }
      });


    } catch (error) {
      console.error(error);
    }
  }

  unmute(): void {
    this.callService.unmute();
    this.muteCallDisableButton = false;
    this.unmuteCallDisableButton = true;
  }

  mute() : void  {
    this.callService.mute();
    this.muteCallDisableButton = true;
    this.unmuteCallDisableButton = false;
  }

  hangUp() : void  {
    this.callService.hangUp();
  }


  startCall(): void {
    this.callService.startCall(this.deviceManager, this.callAgent, this.calleeAcsUserId);

    this.callService.stateModel$.subscribe((stateModel:StateModel) => {
      console.log(stateModel, "startCall state model", stateModel.startCallDisableBoolean, "start boolean");
      this.updateButtonState(stateModel);
      console.log(this.startCallDisableButton, "start boolean");
    });
  }


  acceptIncomingCall(): void {
    this.callService.acceptIncomingCall(this.deviceManager,this.incomingCall);
    this.callService.stateModel$.subscribe(stateModel => {
      console.log(stateModel,"accept incmining call state model")
      this.updateButtonState(stateModel);
    });
  }

  startVideoCall(): void {
    this.callService.startVideoCall(this.deviceManager);
    this.callService.stateModel$.subscribe((stateModel:StateModel) => {
      this.updateButtonState(stateModel);
    });

  }

  stopVideoCall(): void {
    this.callService.stopVideoCall(this.deviceManager);
    this.callService.stateModel$.subscribe((stateModel:StateModel) => {
      this.updateButtonState(stateModel,true);
    });

  }

  updateButtonState(stateModel : StateModel , hiddenBoolean = false): void{
    this.startCallDisableButton = stateModel.startCallDisableBoolean;
    this.acceptCallDisableButton = stateModel.acceptCallDisableBoolean;
    this.hangUpCallDisableButton = stateModel.hangUpCallDisableButton;
    this.connectedLabel = stateModel.connectedLabel;
    this.serverCallId = stateModel.serverCallId;
    this.muteCallDisableButton = stateModel.muteCallDisableButton;
    this.originalText = stateModel.translatedData.original;
    this.translatedText = stateModel.translatedData.translated;

    if(stateModel.viewTarget ){
      let localVideoContainer = document.getElementById('localVideoContainer');
      let remoteVideoContainer = document.getElementById('remoteVideoContainer');
      if(localVideoContainer){
        localVideoContainer.hidden = hiddenBoolean;
        localVideoContainer.appendChild(stateModel.viewTarget);
      }

      if(remoteVideoContainer){
        remoteVideoContainer.hidden = hiddenBoolean;
        // @ts-ignore
        remoteVideoContainer.appendChild(stateModel.remoteViewTarget);
      }
    }
  }


}


