import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { CommonModule } from '@angular/common';


@Component({
  selector: 'app-generation',
  standalone: true,
  imports: [
    CommonModule,       // 基本指令如 *ngIf, *ngFor
    FormsModule,        // [(ngModel)]
    MatCardModule,      // <mat-card>
    MatFormFieldModule, // <mat-form-field>
    MatInputModule,     // <input matInput>
    MatButtonModule     // <button mat-raised-button>
  ],
  templateUrl: './generation.component.html',
  styleUrls: ['./generation.component.css']
})
export class GenerationComponent {
  description = '';
  generatedCode = '';

  generateContract() {
    // 模拟虚拟接口返回
    this.generatedCode = `
    // SPDX-License-Identifier: MIT
    pragma solidity ^0.8.0;
    contract Token {
      string public name = "MockToken";
      uint256 public totalSupply = 1000;
      mapping(address => uint256) public balance;
      constructor() { balance[msg.sender] = totalSupply; }
    }`;
  }
}
