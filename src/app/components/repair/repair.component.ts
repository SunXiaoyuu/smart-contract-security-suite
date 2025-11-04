import { CommonModule } from '@angular/common';
import { Component, numberAttribute } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';

@Component({
  selector: 'app-repair',
  templateUrl: './repair.component.html',
  imports: [
    CommonModule,       // *ngIf, *ngFor
    FormsModule,        // [(ngModel)]
    MatCardModule,      // <mat-card>
    MatButtonModule,    // <button mat-raised-button>
    MatListModule,      // <mat-list> / <mat-list-item>
    MatFormFieldModule, // <mat-form-field>
    MatInputModule      // <textarea matInput>
  ]
})
export class RepairComponent {

  code: string = ''; // 合约代码
  report: any = null; // 用于 *ngIf="report"
  reports: string = ''; // 审计报告

  patchSuggestions :any = '';
  repairedCode = '';


  
  applySuggestion(){
    this.patchSuggestions = {
      suggestion: [
        { num: '1', line: '22', sug: '加入nonReentrant修饰符；' },
        { num: '2', line: '45', sug: '引入SafeMath库；' },
      ]
    };

  }

  applyPatch() {
    this.repairedCode = `
    pragma solidity ^0.4.16;
    contract Example{
      mapping(address => uint) credit;
      uint sum = 1000;
      mapping(address => uint) creditl;
      uint sum1;
      mapping(address => bool) flag;
      function withdraw() public {
        if(flag[msg.sender] == false){
          credit1[msg.sender] = credit[msg.sender];
          suml=sum;
          flag[msg.sender] = true;
        }
        if(credit1[msg.sender]>0 && sum1 >= creditl[msg.sender]){
          creditl[msg.sender]= 0;
          sum1 -= creditl[msg.sender];
        }else{
          credit[msg.sender] = credit1[msg.sender];
          sum = sum1;
          requier(false);}
      }
    }`;
  }
}

