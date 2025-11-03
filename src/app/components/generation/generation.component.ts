import { Component } from '@angular/core';

@Component({
  selector: 'app-generation',
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
